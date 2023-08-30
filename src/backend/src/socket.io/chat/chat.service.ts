import { Injectable } from '@nestjs/common';
import { ChatRoomStoreService, Room } from './store/store.room.service';
import { ChatUserStoreService, User } from './store/store.user.service';
import { ChatMessageStoreService, Message, DM } from './store/store.message.service';
import { Namespace, Socket } from 'socket.io';
import {
  currRoomInfo,
  formedMessage,
  roomInfo,
  userInfo,
} from './types';
import { ChatSocket } from './types';

@Injectable()
export class ChatService {
	constructor(
		private storeUser : ChatUserStoreService,
		private storeRoom : ChatRoomStoreService,
		private storeMessage : ChatMessageStoreService,
	){}

	initChatServer() {
		this.storeUser.saveUser(0, new User(0, 'Server_Admin'));
		this.storeRoom.saveRoom('DEFAULT', new Room()); //owner id 0 as server
	}

	updateUserStatus(io : Namespace, userId : number, isConnected : boolean){
		io.emit("updateUserStatus", userId, isConnected);
	}

	//fetchSockets() returns RemoteSockets{}
	updateChatScreen(client : Socket, clientId : number, roomname : string) {
		const user = this.storeUser.findUserById(clientId);
		const currRoomInfo = this.makeCurrRoomInfo(roomname);
		const roomMembers = this.makeRoomUserInfo(roomname);
		const roomInfo = this.makeRoomInfo(user.blocklist, user.joinlist);
		client.emit("sendRoomList", roomInfo);
		client.emit("sendRoomMembers", roomMembers);
		client.emit("sendCurrRoomInfo", currRoomInfo);
	}

	async extractSocketsInRoomById(io: Namespace, targetId : number, roomname : string) : Promise<ChatSocket[]> {
		const res = [];
		const sockets = await io.in(roomname).fetchSockets()
						.catch((error) => {
							return (error.message);
						});
		sockets.forEach((socket : ChatSocket) => {
			if (socket.userId === targetId)
				res.push(socket);
		})
		return (res);
	}

	//sendMessage
	processMessage(
			io : Namespace,
			fromId : number,
			to : string,
			body : string,
			save : boolean,
			except? : string	//빼려는 중!
		) : formedMessage {
		let msg = null;
		if (save){
			msg = new Message(fromId, body);
			const room = this.storeRoom.findRoom(to);
			room.messages.push(msg);
		}
		const format = {
			from : this.storeUser.getNicknameById(fromId),
			body : body,
			at : msg? msg.at : Date.now()
		}
		if (except)
			io.in(to).except(except).emit("sendMessage", to, format);
		else
			io.in(to).emit("sendMessage", to, format);
		return (format);
	}

	// bindUserRoom et unbindUserRoom
	// bindUserRoom(user : User, room : Room, roomname : string) {
	// 	user.joinlist.add(roomname);
	// 	room.addUserToUserlist(user.id);
	// }

	// unbindUserRoom(user : User, room : Room, roomname : string) {
	// 	user.joinlist.delete(roomname);
	// 	room.deleteUserFromUserlist(user.id);
	// }

	handleNewConnection(io : Namespace, client : ChatSocket) {
		const userId = client.userId;
		client.join(`$${userId}`);
		let user : User = this.storeUser.findUserById(userId);
		if (user === undefined)
			user = this.storeUser.saveUser(userId, new User(userId, client.nickname));
		if (user.connected === false){
			user.connected = true;
			this.updateUserStatus(io, userId, true);
		}
		this.userJoinRoomAct(io, client, userId, "DEFAULT")
	}

	//마지막 하나일 때만 모든 방의 접속을 삭제한다
	//TODO & CHECK : if it works well...?
	async handleDisconnection(io: Namespace, client : ChatSocket) : Promise<void> {
		const userId = client.userId;
		const connections = await io.in(`$${userId}`).fetchSockets()	//connection check
						.then((res : any) => {
							console.log("res : " + res.length);
							return (res.length);
						})
						.catch((error : any) => {
							console.log(error.message);
							throw new Error(error.message);
						});
		if (!connections) {
			const user = this.storeUser.findUserById(userId);
			user.connected = false;
			this.userLeaveRooms(io, client, user.joinlist);
			this.updateUserStatus(io, userId, false);
		}
	}

	async userJoinRoomAct(io : Namespace, client : any, clientId : number, roomname : string) {
		const user = this.storeUser.findUserById(clientId);
		if (!user.joinlist.has(roomname))
		{
			const room = this.storeRoom.findRoom(roomname);
			if (!room)
				throw new Error(`[userJoinRoomAct] ${roomname} room is not exist`);
			
			//bind room & user
			user.joinlist.add(roomname);
			room.addUserToUserlist(user.id);
			
			//save welcome message
			const body = `Welcome ${user.nickname} !`;
			this.processMessage(io, 0, roomname, body, true);
			
			//send updateRoomMembers event to room
			const roomMembers = this.makeRoomUserInfo(roomname);
			io.in(roomname).emit("sendRoomMembers", roomMembers);
		}
		client.join(roomname);
		client.data.currRoom = roomname;
		console.log(`update Room  + `, roomname);
		this.updateChatScreen(client, clientId, roomname);
	}



	BanCheck(io : Namespace, client : ChatSocket, room : Room) : boolean {
		if (room.isBanned(client.userId)){
			client.emit("sendAlert", "[ Act Error ]", `You are banned from room ${room}`);
			return (false);
		}
		return (true);
	}

	async userJoinRoom(io : Namespace, client : ChatSocket, roomname : string, password? : string) {
		const userId = client.userId;
		let room = this.storeRoom.findRoom(roomname);
		if (room === undefined){
			this.storeRoom.saveRoom(roomname, new Room(userId, password? password : null));
			room = this.storeRoom.findRoom(roomname);
			this.userJoinRoomAct(io, client, userId, roomname);
		}
		else {
			if (room.isJoinning(userId)){
				this.userJoinRoomAct(io, client, userId, roomname);
				return ;
			}
			if (room.isPrivate){
				client.emit("sendAlert", "[ Act Error ]", `${roomname} is Private Room`);
				return ;
			}
			const pwExist = room.password? true : false ;
			if (pwExist) {
				if (password){
					if (room.isPassword(password)){
						if (this.BanCheck(io, client, room))
							this.userJoinRoomAct(io, client, userId, roomname);
					}
					else
						client.emit("wrongPassword", roomname);
				}
				else
					client.emit("requestPassword", roomname);
			}
			else {
				if (this.BanCheck(io, client, room))
					this.userJoinRoomAct(io, client, userId, roomname);
			}
		}
	}

	//TODO : Alert message 일관성 있게 정리하기
	setPassword(io: Namespace, client : ChatSocket, roomname : string, password : string){
		const room = this.storeRoom.findRoom(roomname);
		if (room.isOwner(client.userId)){
			room.updatePassword(password);
			client.emit("sendAlert", "[ Notice ]", "Password is updated");
		}
		else
			client.emit("sendAlert", "[ Act Error ]", "Only owner can change password");
	}

	//CHECK : error check
	setRoomStatus(io : Namespace, client : ChatSocket, roomname : string, toPrivate : boolean) {
		const room = this.storeRoom.findRoom(roomname);
		if (!room)
			throw new Error ("Error : Room does not exist");
		if (room.isOwner(client.userId)){
			if (toPrivate) {
				if (room.isPrivate)
					client.emit("sendAlert", "[ Alert ]", 'Room is already Private');
				else {
					room.isPrivate = true;
					io.to(roomname).emit("sendCurrRoomInfo", this.makeCurrRoomInfo(roomname));
				}
			}
			else {
				if (room.isPrivate) {
					room.isPrivate = false;
					io.to(roomname).emit("sendCurrRoomInfo", this.makeCurrRoomInfo(roomname));
				}
				else
					client.emit("sendAlert", "[ Alert ]", 'Room is already Public');
			}
		}
		else
			client.emit("sendAlert", "[ Act Error ]", "Only owner can set room status");
	}

	sendChat(io : Namespace, client: ChatSocket, to : string, body : string){
		const room = this.storeRoom.findRoom(to);
		if (room === undefined){
			throw new Error ("Error : Room does not exist");
		}
		if (room.userlist.has(client.userId)){
			if (!room.isMuted(client.userId)){
				this.processMessage(io, client.userId, to, body, true);
			}
			else
				client.emit("sendAlert", "[ Alert ]", `You are MUTED in ${to}`);
		}
		else {
			client.emit("sendAlert", "[ Act Error ]", `You are not joining in room ${to}`);
		}
	
	}

	userLeaveRoom(io : Namespace, client : ChatSocket, roomname : string){
		const userId = client.userId;
		const room = this.storeRoom.findRoom(roomname);
		const thisUser = this.storeUser.findUserById(userId);
		if (room === undefined){
			//혹은 socket에 emit? TODO : 일관성 있는 처리
			throw new Error("Error : Room does not exist");
		}
		if (room.userlist.has(userId) && thisUser.joinlist.has(roomname)){
			if (room.userlist.size == 1)
			{
				room.clearRoom();
				this.storeRoom.deleteRoom(roomname);
				thisUser.joinlist.delete(roomname);
			}
			else {
				//TODO : owner나 operator update 될 때 모든 유저에게 currRoomInfo 보내야하지 않는지...? < 보내자!
				if (room.isOwner(userId))
				{
					const newOwner = room.userlist.values().next().value;
					room.updateOwner(newOwner);
					if (room.isOperator(newOwner))
						room.deleteUserFromOperators(newOwner);
					io.to(roomname).except(`$${userId}`).emit("sendCurrRoomInfo", this.makeCurrRoomInfo(roomname));
				}
				if (room.isOperator(userId)){
					room.deleteUserFromOperators(userId);
					io.to(roomname).except(`$${userId}`).emit("sendCurrRoomInfo", this.makeCurrRoomInfo(roomname));
				}
				thisUser.joinlist.delete(roomname);
				room.deleteUserFromUserlist(userId);
				const body = `Good bye ${thisUser.nickname}`;
				this.processMessage(io, 0, roomname, body, true);
				//CHECK : except 잘 작동하는지 확인
				io.to(roomname).except(`$${userId}`).emit("sendRoomMembers", this.makeRoomUserInfo(roomname));
			}
		}
		else
			console.log("you are not joining in this room : try leave");
	}
	
	async userLeaveRoomAct(io : Namespace, targetId : number, roomname : string, alertMsg? : string){
		await this.extractSocketsInRoomById(io, targetId, roomname)
			.then((res) => {
				res.forEach((socket) => {
					socket.leave(roomname);
					this.updateChatScreen(socket, targetId, "DEFAULT");
					if (alertMsg)
						socket.emit("sendAlert", "[ Alert ]", `${alertMsg}`)
				})
			})
			.catch((error) => {
				//return 이냐 error냐...!
				throw new Error(error.message);
			});
	}

	userLeaveRooms(io : Namespace, client : ChatSocket, roomlist : Set<string>){
		roomlist.forEach((room) => {
			this.userLeaveRoom(io, client, room);
		})
	}



	//kickUser TODO & CHECK : 이 부분 logic 다시 봐야됨!
	//banUser 랑 하부 로직이 완전히 같다...!
	async kickUser(io : Namespace, client : ChatSocket, roomname : string, targetName : string){
		const targetId = this.storeUser.getIdByNickname(targetName);
		const room = this.storeRoom.findRoom(roomname);
		if (this.checkActValidity(client, roomname, targetId, "kick")){
			// delete user from room & room from user
			const targetUser = this.storeUser.findUserById(targetId);
			room.deleteUserFromUserlist(targetId);
			targetUser.joinlist.delete(roomname);
			
			await this.userLeaveRoomAct(io, targetId, roomname, `You are kicked out from ${roomname}`);
			
			if (room.isOperator(targetId)){
				room.deleteUserFromOperators(targetId);
				io.to(roomname).emit("sendCurrRoomInfo", this.makeCurrRoomInfo(roomname));
			}
			//저장할건가...? (현재 false)
			const body = `${targetUser.nickname} is Kicked Out`;
			this.processMessage(io, 0, roomname, body, false);
			io.to(roomname).emit("sendRoomMembers", this.makeRoomUserInfo(roomname));
		}
	}

	//ban을 할 수 있는가?
	async banUser(io : Namespace, client : ChatSocket, roomname : string, targetName : string){
		const targetId = this.storeUser.getIdByNickname(targetName);
		const room = this.storeRoom.findRoom(roomname);
		if (this.checkActValidity(client, roomname, targetId, "ban")){
			room.addUserToBanlist(targetId);
			
			// delete user from room & room from user
			const targetUser = this.storeUser.findUserById(targetId);
			room.deleteUserFromUserlist(targetId);
			targetUser.joinlist.delete(roomname);

			await this.userLeaveRoomAct(io, targetId, roomname, `You are temporaily banned from ${roomname}`);

			if (room.isOperator(targetId)){
				room.deleteUserFromOperators(targetId);
				io.to(roomname).emit("sendCurrRoomInfo", this.makeCurrRoomInfo(roomname));
			}
			//저장할건가...? (현재 false)
			const body = `${targetUser.nickname} is banned`;
			this.processMessage(io, 0, roomname, body, false);
			io.to(roomname).emit("sendRoomMembers", this.makeRoomUserInfo(roomname));
		}
	}

	async muteUser(io : Namespace, client : ChatSocket, roomname: string, targetName : string){
		const targetId = this.storeUser.getIdByNickname(targetName);
		const room = this.storeRoom.findRoom(roomname);
		if (!this.checkActValidity(client, roomname, targetId, "mute"))
			return ;
		if (room.isMuted(targetId))
			client.emit("sendMessage", roomname, {
				from : "server",
				body : `${this.storeUser.getNicknameById(targetId)} is already muted`,
				at : Date.now()
			});
		else{
			if (room.isOperator(targetId))
				room.deleteUserFromOperators(targetId);	//TODO & CHECK	//혹은 여기서는 그냥 해제 안 하는건?
			room.addUserToMutelist(targetId);
			//TODO : 아래로 바꾸고 싶다...! & CHECK!
			const sockets = await this.extractSocketsInRoomById(io, targetId, roomname)
			sockets.forEach((socket) => {
					this.processMessage(io, 0, socket.id, `You are temporaily muted by ${client.nickname}`, false);
				})
			// .catch((error) => {
			// 	//return 이냐 error냐...!	//filter 쓰면 다 막히지 않을까!
			// 	throw new Error(error.message);
			// });
			// 체크하고 지울 것
			// io.to(roomname).except(`$${targetId}`).emit("sendMessage", roomname, {	//here you need except
			// 	from : "server",
			// 	body :	`${this.storeUser.getNicknameById(targetId)} is temporaily muted`,
			// 	at : Date.now()
			setTimeout(() => {
				room.deleteUserFromMutelist(targetId);
				//TODO & CHECK
				sockets.forEach((socket) => {
					this.processMessage(io, 0, socket.id, `You are now unmuted `, false);
				})
				// this.emitEventsToAllSockets(io, targetId, "sendMessage", roomname, {
				// 	from : "server",
				// 	body : `You are now unmuted `,
				// 	at : Date.now()
				// })
			}, 20000);
		}
	}

	//TODO : makeBlocklist method & makeUserRender method 필요해....
	blockUser(io : Namespace, client : ChatSocket, target : string) {
		const thisUser = this.storeUser.findUserById(client.userId);
		const targetId = this.storeUser.getIdByNickname(target);
		if (thisUser.blocklist.has(targetId))
			client.emit("sendAlert", "[ Notice ]", "You've already blocked this user");
		else {
			(thisUser.addUserToBlocklist(targetId));
			client.emit("sendAlert", "[ Notice ]", `Successfully block ${target}`);
			const blocklist = [];
			thisUser.blocklist.forEach((user) => 
					blocklist.push(this.storeUser.getNicknameById(user)));
			client.emit("sendBlocklist", blocklist);
		}
	}

	//TODO & CHECK unblockUser 할 때도 이렇게 하면 되나...?
	//이 경우에는 currRoomInfo, members 모두 보내줘야 하는거 아닌지...?
	unblockUser(io : Namespace, client : ChatSocket, target : string) {
		const thisUser = this.storeUser.findUserById(client.userId);
		const targetId = this.storeUser.getIdByNickname(target);
		if (thisUser.blocklist.has(targetId)){
			(thisUser.deleteUserFromBlockList(targetId));
			client.emit("sendAlert", "[ Notice ]", `Successfully unblock ${target}`);
			const blocklist = [];
			thisUser.blocklist.forEach((user) => 
					blocklist.push(this.storeUser.getNicknameById(user)));
			// client.emit("sendBlocklist", blocklist); -> 여기서는 userlist 보내야 할 듯 CHECK
		}
		else {
			client.emit("sendAlert", "[ Notice ]", `${target} is not blocked yet`);
		}
	}

	addOperator(io : Namespace, client: ChatSocket, roomname : string, target : string){
		const room = this.storeRoom.findRoom(roomname);
		if (!room.isOwner(client.userId))
			client.emit("sendAlert", "[ Act Error ]", "Only owner can add operator");
		else {
			const targetId = this.storeUser.getIdByNickname(target);
			if (room.isOperator(targetId))
				client.emit("sendAlert", "[ Act Error ]", "Target is already an operator");
			else {
				room.addUserToOperators(targetId);
				io.to(roomname).emit("sendCurrRoomInfo", this.makeCurrRoomInfo(roomname));
			}
		}

	}

	deleteOperator(io : Namespace, client: ChatSocket, roomname : string, target : string){
		const room = this.storeRoom.findRoom(roomname);
		if (!room.isOwner(client.userId))
			client.emit("sendAlert", "[ Act Error ]", "Only Owner can delete operator");
		else {
			const targetId = this.storeUser.getIdByNickname(target);
			if (room.isOperator(targetId)){
				room.deleteUserFromOperators(targetId);
				io.to(roomname).emit("sendCurrRoomInfo", this.makeCurrRoomInfo(roomname));
			}
			else {
				client.emit("sendAlert", "[ Act Error ]", "target is not an operator");
			}
		}

	}

	getAllRoomList(userId : number) : roomInfo[] | null {
		const roomlist = [];
		const blocklist = this.storeUser.findUserById(userId)?.blocklist;
		this.storeRoom.rooms?.forEach((value, key) => {
			if (!value.isPrivate)
				roomlist.push(key);
		})
		if (!roomlist || !blocklist)
			return null;	//null? or throw Error?
		return (this.makeRoomInfo(blocklist, roomlist));
	}

	getUserRoomList(userId : number) : roomInfo[] | null {
		const thisUser = this.storeUser.findUserById(userId);
		if (!thisUser)
			return null;	//null? or throw Error?
		return (this.makeRoomInfo(thisUser.blocklist, thisUser.joinlist));
	}


	//TODO : 여기도 최근 메세지! <- 그러려면? blockList있어야 됨
	getQueryRoomList(userId : number, query : string | null) : roomInfo[] | null {
		if (query === null || query.length === 0)
			return ([]);
		const thisUser = this.storeUser.findUserById(userId);
		const roomlist = this.storeRoom.findQueryMatchRoomNames(query);
		if (!thisUser || !roomlist || roomlist.length === 0)
			return ([]);
		return (this.makeRoomInfo(thisUser.blocklist, roomlist));
	}

	
	//TODO & CHECK : make DMform MessageFrom 함수 있으면 편하지 않을까
	fetchDM(io : Namespace, client : ChatSocket, target : string, body : string){
		const from = client.userId;
		const to = this.storeUser.getIdByNickname(target);
		const message = new DM(from, to, body);
		const res = {
			from : this.storeUser.getNicknameById(from),
			body : body,
			at : message.at
		};
		this.storeMessage.saveMessage(message);
		io.to([`$${from}`, `$${to}`]).emit("sendDM", this.storeUser.getNicknameById(to), res);	//if you touch ${} here is going to change the most
	}

	makeDMRoomMessages(client : ChatSocket, to : string) : formedMessage[] | null {
		const toId = this.storeUser.getIdByNickname(to);
		const fromUser = this.storeUser.findUserById(client.userId);
		const toUser = this.storeUser.findUserById(toId);
		if (fromUser.blocklist.has(toId)) {
			client.emit("sendAlert", "[ Act Error ]", `You already blocked ${to}`)
			return null;
		}
		else if (toUser.blocklist.has(client.userId)) {
			//TODO : discuss : 그래도 이건 기능적으로 볼 수 있어야하는거 아닌가...? 차라리 block된 유저라고 해주면 모를까...
			client.emit("sendAlert", "[ Act Error ]", `You are blocked by ${fromUser.nickname}`)
			return null;
		}
		else {
			const msg = this.storeMessage
						.findMessagesForUser(client.userId, toId)
						.map(message => ({
							from : this.storeUser.getNicknameById(message.from),
							to : this.storeUser.getNicknameById(message.to),
							body : message.body,
							at : message.at
						}));
			return (msg);
		}
	}

	//CHECK 1. 어디서 쓰는지 2. getAllUserInfo랑 다소 겹침 & second variable is removable -> 현재 안 씀
	// makeUserStatus(userId : number, connection: boolean) : userInfo {
	// 	const user = this.storeUser.findUserById(userId);
	// 	return ({
	// 		id : userId,
	// 		nickname : user.nickname,
	// 		isGaming : user.isGaming,
	// 		isConnected : user.connected
	// 	});
	// }
	
	makeRoomInfo(blocklist : Set<number>, roomlist : string[] | Set<string>) : roomInfo[] {
		const res = [];
		roomlist.forEach((room : string) => {
			const message = this.storeRoom.findRoom(room).getLastMessage(blocklist);
			res.push({
				roomname : room,
				lastMessage : message.body	//body만 보내도록
			})
		})
		return res;
	}

	makeRoomUserInfo(roomname : string) : userInfo[] {
		const room : Room = this.storeRoom.findRoom(roomname);
		if (!room || room.userlist.size === 0)
			return ([]);
		const userInfo = [];
		room.userlist.forEach((user) => {
			const target : User = this.storeUser.findUserById(user);
			userInfo.push({
				id : user,
				nickname : target.nickname,
				isGaming : target.isGaming
			})
		})
		return (userInfo);
	}

	mappingMessagesUserIdToNickname(messages : Message[]) : formedMessage[] {
		const res = [];
		messages.forEach((msg) => {
			res.push({
				from : `${this.storeUser.getNicknameById(msg.from)}`,
				body : msg.body,
				at : msg.at
			})
		})
		return (res);
	}

	makeCurrRoomInfo(roomname : string) : currRoomInfo {
		const room = this.storeRoom.findRoom(roomname);
		if (!room)
				throw new Error(`[makeCurrRoomInfo] : ${roomname} room is not exist`);
		let owner : string | null ;
		if (room.owner === 0)
			owner = null;
		else
			owner = this.storeUser.getNicknameById(room.owner);
		const operatorList = [];
		room.operators.forEach((user) => {
			operatorList.push(this.storeUser.getNicknameById(user));
		})
		const res = {
			roomname : roomname,
			owner : owner,
			operators : operatorList,
			messages : this.mappingMessagesUserIdToNickname(room.messages),
			isPrivate : room.isPrivate,
			isProtected : room.password ? true : false
		}
		return (res)
	}

	//TODO : sendAlert message 분리하려면 이 함수에서 Socket 받아야함!
	//채팅방에서 어떤 행동을 할 때 가능한지 모두 체크 : 권한, 유효성, etc.
	checkActValidity(client : ChatSocket, roomname : string, target : number, act : string) : boolean {
		const actor = client.userId;
		if (actor === target) {
			client.emit("sendAlert", "[ ACT ERROR ]", `you can't ${act} yourself`)
			return (false);
		}
		const room = this.storeRoom.findRoom(roomname);
		if (room === undefined){
			client.emit("sendAlert", "[ ACT ERROR ]", `(${act}) Room does not exist`)
			return (false);
		}
		const user = this.storeUser.findUserById(actor);
		if (user === undefined || !user.joinlist.has(roomname)){
			client.emit("sendAlert", "[ ACT ERROR ]", `(${act}) invalid Actor`)
			return (false);
		}
		if (!room.isOwner(user.id) && !room.isOperator(user.id)){
			client.emit("sendAlert", "[ ACT ERROR ]", `You are not authorized to ${act}`)
			return (false);
		}
		const targetName = this.storeUser.getNicknameById(target);
		if (target === 0 || targetName === undefined){
			client.emit("sendAlert", "[ ACT ERROR ]", `(${act}) Target does not exist`)
			return (false);
		}
		else if (!room.isJoinning(target)){
			client.emit("sendAlert", "[ ACT ERROR ]", `${targetName} is not joining this room`)
			return (false);
		}
		else if (room.isOwner(target)){
			client.emit("sendAlert", "[ ACT ERROR ]", `${targetName} is the Owner`)
			return (false);
		}
		else if (room.isOperator(target) && !room.isOwner(actor)){
			client.emit("sendAlert", "[ ACT ERROR ]", `Only owner can ${act} Operator`)
			return (false);
		}
		return (true);
	}

	//TODO : 되는지 확인 // 이거 쓸건지...? -> 문제없으면 빼자
	async emitEventsToAllSockets(io : Namespace, targetId : number, eventname : string, args1? : any, args2? : any) : Promise<void> {
		const sockets = await io.in(`$${targetId}`).fetchSockets();
		sockets.forEach((socket) => {
			socket.emit(eventname, args1, args2);
		})
	}

	//CHECK : 좀 처리가 일관성이 없는게 joinlist도 persistent 하게 할지 말지 안 정해놓고 시작함ㅠ -> 주석 정리시 check
	getAllUserInfo() : userInfo[] {
		const users = this.storeUser.findAllUser();
		const res = [];
		users?.forEach((user) => {
			res.push({
				id : user.id,
				nickname : user.nickname,
				isGaming : user.isGaming,
				isConnected : user.connected
			})
		});
		return (res);
	}

	userChangeNick(io : Namespace, client : ChatSocket, newNick : string) {
		const user = this.storeUser.findUserById(client.userId);
		user.nickname = newNick;
		//중앙과 우측을 update 해야
		//해당 아이디가 있는 방에 모두 보내면 어떰? -> 그럼 안 들어가 있는 애들은 default로 가버림... 흑흑
		//현재 각 소켓이 그 방에 있을때! emit하게.... 어떻게 함...? 흑흑 결국 currRoom 관리해야함?ㅠㅠ
		user.joinlist.forEach((room) => {
			const currRoomInfo = this.makeCurrRoomInfo(room);
			const roomMembers = this.makeRoomUserInfo(room);
			io.in(room).emit("sendRoomMembers", roomMembers);
			io.in(room).emit("sendCurrRoomInfo", currRoomInfo);
		})
	}
}