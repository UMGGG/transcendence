import { Injectable } from '@nestjs/common';
import { ChatRoomStoreService, Room } from '../store/store.room.service';
import { ChatUserStoreService, User } from '../store/store.user.service';
import { ChatMessageStoreService, Message, DM } from '../store/store.message.service';
import { Namespace } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import {
  currRoomInfo,
  formedMessage,
  queryResponseRoomInfo,
  roomInfo,
  userInfo,
} from './chat.types';
import { ChatSocket } from './types';

@Injectable()
export class ChatService {
	constructor(
		private storeUser : ChatUserStoreService,
		private storeRoom : ChatRoomStoreService,
		private storeMessage : ChatMessageStoreService,
		private jwtService : JwtService
	){}

	//TODO : 유저가 소켓 연결을 하기 전에 닉네임을 변경하는 경우가 있는지 확인할 것 : 없는 듯?
	//TODO : 여기 socket만 받으면 됨!
	async newConnection(io : Namespace, client : ChatSocket, userId : number, nickname : string) : Promise<void> {
		client.join(`$${userId}`);
		let user : User = this.storeUser.findUserById(userId);
		if (user === undefined)
			user = this.storeUser.saveUser(userId, new User(userId, nickname));
		user.connected = true;
		await this.userJoinRoomAct(io, user, "DEFAULT")
			.catch((error) => {
				throw new error(error.message);	//CHECK : how it works
			});	//이게 마지막에 실행된다... 안돼...<- ?
		user.currentRoom = "DEFAULT";
	}

	//마지막 하나일 때만 모든 방의 접속을 삭제한다
	//TODO & CHECK : if it works well...?
	async disconnectUser(io: Namespace, userId : number) : Promise<void> {
		const sockets = io.in(`$${userId}`).fetchSockets();
		if (sockets.length === 1) {
			const user = this.storeUser.findUserById(userId);
			user.connected = false;
			this.userLeaveRooms(io, userId, user.joinlist);
		}
	}

	async userJoinRoomAct(io: Namespace, user : User, roomname : string) {
		//make all user's socket to join room
		const sockets = await io.in(`$${user.id}`).fetchSockets();
		sockets.forEach((socket : ChatSocket) => {
			socket.join(roomname);
		})
		if (!user.joinlist.has(roomname))
		{
			//add user to room / room to user
			user.joinlist.add(roomname);
			const room = this.storeRoom.findRoom(roomname);
			room.addUserToUserlist(user.id);
			//save welcome message
			const body = `Welcome ${user.nickname} !`;
			const message = new Message(-1, body);
			io.in(roomname).emit("sendMessage", roomname, {
				from : "Server_Admin",
				body : body,
				at : message.at
			});
			room.messages.push(message);
			//notice new comer to those who currently in the room
			//CHECK : if it is really necessary...
			const joiners = await io.in(roomname).fetchSockets();
			const roomMembers = this.makeRoomUserInfo(roomname);
			joiners.forEach((socket : ChatSocket) => {
				if (this.storeUser.findUserById(socket.data.id).currentRoom === roomname)
					socket.emit("sendRoomMembers", roomMembers);
			})
		}
		user.currentRoom = roomname;
		const currRoomInfo = this.makeCurrRoomInfo(roomname);
		const roomMembers = this.makeRoomUserInfo(roomname);
		const roomInfo = this.makeRoomInfo(user.blocklist, user.joinlist);
		// CHECK: if i can use these functions
		// this.emitEventsToAllSockets(io, user.id, "sendRoomList", this.makeRoomInfo(user.joinlist));
		// this.emitEventsToAllSockets(io, user.id, "sendRoomMembers", roomMembers);
		// this.emitEventsToAllSockets(io, user.id, "sendCurrRoomInfo", currRoomInfo);
		sockets.forEach((socket) => {
			console.log("res", roomInfo, roomMembers, currRoomInfo);
			socket.emit("sendRoomList", roomInfo);
			socket.emit("sendRoomMembers", roomMembers);
			socket.emit("sendCurrRoomInfo", currRoomInfo);
			socket.emit('hi', 'hi1');
		})
	}

	//userJoinRoom
	// 방이 이미 존재하는 방인지 확인  
		// 안 존재하는 방이라면
			//1. 방을 storeRoom에 등록한다.
			//2. 유저를 join 을 이용해서 그 방으로 연결해준다. (userlist에 등록한다)
			//3. welcome message!
		// 존재하는 방이라면
			//1. password 가 match 하는지 확인(TODO: 만약 입력안하면 무슨 값으로 들어오는지 체크)
				// password가 들어오지 않음 -> password를 요청하는 이벤트를 emit
				// password가 맞지 않음 -> password가 잘못되었다는 이벤트를 emit
			//2. banlist 를 확인
				// 리스트에 있으면 -> 일정시간동안 ban되었다는 이벤트를 emit
			//3. 유저를 join을 이용해서 그 방으로 연결(유저리스트 등록하고 welcome message)
	//if 3중 중첩문.... 이대로 괜찮은가.......

	//(CLOSE) 한 유저가 여러 소켓을 가진 경우에 대해 : 모든 창에 경고를 띄울 필요 있을까? -> 창하나만
	//하지만 join은 전부 처리해줘야 (CLOSE)
	JoinRoomBanCheck(io : Namespace, client : ChatSocket, room : Room) : boolean {
		if (room.isBanned(client.data.id)){
			client.emit("sendAlert", "Banned User", "You are not allowed to join this room");
			return (false);
		}
		return (true);
	}

	//TODO : client.data.id -> client.id
	async userJoinRoom(io : Namespace, client : ChatSocket, roomname : string, password? : string) {
		const userId = client.data.id;
		let room = this.storeRoom.findRoom(roomname);
		if (room === undefined){
			this.storeRoom.saveRoom(roomname, new Room(userId, password? password : null));
			room = this.storeRoom.findRoom(roomname);
			this.userJoinRoomAct(io, this.storeUser.findUserById(userId), roomname);
		}
		else {
			//TODO : banCheck//
			//TODO : 이미 들어간 방이면 password를 묻지 않는다.... 그런데 이 때는 웰컴 메세지도 안 보내야하는거 아닌지?
			if (room.isJoinning(userId)){
				console.log("userJoinRoom : enter --------------------------------------------2")
				this.userJoinRoomAct(io, this.storeUser.findUserById(userId), roomname);
				return ;
			}
			if (room.isPrivate){
				client.emit("sendAlert", "Alert", "This room is Private");
				return ;
			}

			//TODO : banCheck를 상단으로 빼는게 좋지 않을까? 아님 비번을 치고 bancheck를 하려면 이 방법이 최신이긴 하다
			const pwExist = room.password? true : false ;
			if (pwExist) {
				if (password){
					if (room.isPassword(password)){
						if (this.JoinRoomBanCheck(io, client, room))
							this.userJoinRoomAct(io, this.storeUser.findUserById(userId), roomname);
					}
					else
						client.emit("wrongPassword", roomname);
				}
				else
					client.emit("requestPassword", roomname);
			}
			else {
				if (this.JoinRoomBanCheck(io, client, room))
					this.userJoinRoomAct(io, this.storeUser.findUserById(userId), roomname);
			}
		}
	}

	//TODO : Alert message 일관성 있게 정리하기
	setPassword(io: Namespace, client : ChatSocket, roomname : string, password : string){
		const room = this.storeRoom.findRoom(roomname);
		if (room.isOwner(client.data.id)){
			room.updatePassword(password);
			console.log("password updated");
		}
		else
			client.emit("sendAlert", "Alert", "You have no authority");
	}

	//CHECK : error check
	setRoomStatus(io : Namespace, client : ChatSocket, roomname : string, toPrivate : boolean) {
		const room = this.storeRoom.findRoom(roomname);
		if (!room)
			throw new Error ("Error : Room does not exist");
		if (room.isOwner(client.data.id)){
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
			client.emit("sendAlert", "[ Alert ]", "Only owner can set room status");
	}

	//TODO : sendMessage -> make method
	sendChat(io : Namespace, client: ChatSocket, to : string, body : string){
		const room = this.storeRoom.findRoom(to);
		if (room === undefined){
			throw new Error ("Error : Room does not exist");
			// return ;
		}
		if (room.userlist.has(client.data.id)){
			if (!room.isMuted(client.data.id)){
				const message = new Message(client.data.id, body);
				io.in(to).emit("sendMessage", to, {
					from : client.data.nickname,
					body : body,
					at : message.at
				});
				room.messages.push(message);
			}
			else
				client.emit("sendAlert", "Attention", `You are MUTED in ${to}`);
		}
		else {
			client.emit("sendAlert", "Attention", `You are not joining in room ${to}`);
		}
	
	}

	userLeaveRoom(io : Namespace, client : ChatSocket, roomname : string){
		const userId = client.data.id;
		const room = this.storeRoom.findRoom(roomname);
		const thisUser = this.storeUser.findUserById(userId);
		if (room === undefined){
			//혹은 socket에 emit? TODO : 일관성 있는 처리
			throw new Error("Error : Room does not exist");
			// return ;
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
				}
				if (room.isOperator(userId)){
					room.deleteUserFromOperators(userId);

				}
				thisUser.joinlist.delete(roomname);
				room.deleteUserFromUserlist(userId);
				//TODO : sendMessage Method화
				const body = `Good bye ${thisUser.nickname}`
				io.to(roomname).emit("sendMessage", body);
				room.messages.push(new Message(-1, body));
				//CHECK : currRoom을 확인하고 보내기 vs 클라이언트가 처리하기 <- next가 해주는 것 같은데? : latter case, 위에서도 currRoomStatus 체크하는거 뺄 것(ysungwon님이랑 상의)
				//CHECK : except 잘 작동하는지 확인
				io.to(roomname).except(`$${userId}`).emit("sendRoomMembers", this.makeRoomUserInfo(roomname));
			}
		}
		else
			console.log("you are not joining in this room : try leave");
	}
	
	async userLeaveRoomAct(io : Namespace, client : ChatSocket, roomname : string){
		const userid = client.data.id;
		const sockets = await io.in(`$${userid}`).fetchSockets();
		sockets.forEach((socket : ChatSocket) => {
			socket.leave(roomname);
		})
		this.userJoinRoomAct(io, this.storeUser.findUserById(client.data.id), "DEFAULT");
	}

	userLeaveRooms(io : Namespace, userId : number, roomlist : Set<string>){
		roomlist.forEach((room) => {
			this.userLeaveRoom(io, userId, room);
		})
	}


	//kickUser TODO & CHECK : 이 부분 logic 다시 봐야됨!
	async kickUser(io : Namespace, roomname : string, targetId : number){
		const room = this.storeRoom.findRoom(roomname);
		//여기서 target한테 emit을 해야하는데... 어떻게...? 이게 문제네 흑흑 < DM방으로 실현하자... ! 와 DM만만세!
		if (room.isOperator(targetId))
			room.deleteUserFromOperators(targetId);
		room.deleteUserFromUserlist(targetId);
		//이하는 userLeave랑 작용이 같다
		const targetUser = this.storeUser.findUserById(targetId);
		targetUser.joinlist.delete(roomname);
		targetUser.currentRoom = "DEFAULT";
		this.userJoinRoomAct(io, targetUser, "DEFAULT");
		const body = `${targetUser.nickname} is Kicked Out`;
		io.to(roomname).emit("sendMessage", roomname, {
			from : "server",
			body : body,
			at : Date.now()
		});	//쫓겨나는 사람은 제하는게 좋을지도
		io.to(roomname).emit("sendRoomMembers", this.makeRoomUserInfo(roomname));
		room.storeMessage(-1, body);
		const sockets = await io.in(`$${targetId}`).fetchSockets();
		sockets.forEach((socket) => {
			socket.leave(roomname);
			socket.emit("sendAlert", "Attention", `You are kicked out from ${roomname}`);
			socket.emit("sendRoomMembers", this.makeRoomUserInfo("DEFAULT"));
		})
		//TODO & DISCUSS : checkValidity실패했을때 어떻게 할지
	}

	//ban을 할 수 있는가?
	banUser(io : Namespace, roomname : string, targetId : number){
		const room = this.storeRoom.findRoom(roomname);
		if (room.isOperator(targetId)){
			console.log("banUser: " + roomname + targetId);
			room.deleteUserFromOperators(targetId);
			room.deleteUserFromUserlist(targetId);
			//여기서 특정 시간동안 banlist에 올리고
			//kick하고
			//message를 보낸다
		}
		room.addUserToBanlist(targetId);
		this.kickUser(io, roomname, targetId);
	}

	muteUser(io : Namespace, client : ChatSocket, roomname: string, targetId : number){
		const room = this.storeRoom.findRoom(roomname);
		if (room.isMuted(targetId))
			client.emit("sendMessage", roomname, {
				from : "server",
				body : `${this.storeUser.getNicknameById(targetId)} is already muted`,
				at : Date.now()
		})
		else{
			room.addUserToMutelist(targetId);
			this.emitEventsToAllSockets(io, targetId, "sendMessage", roomname, {
				from : "server",
				body : `You are temporaily muted by ${client.data.nickname}`,
				at : Date.now()
			})
			io.to(roomname).except(`$${targetId}`).emit("sendMessage", roomname, {
				from : "server",
				body :	`${this.storeUser.getNicknameById(targetId)} is temporaily muted`,
				at : Date.now()
			})
			setTimeout(() => {
				room.deleteUserFromMutelist(targetId);
				this.emitEventsToAllSockets(io, targetId, "sendMessage", roomname, {
					from : "server",
					body : `You are now unmuted `,
					at : Date.now()
				})
			}, 20000);
		}
	}

	//TODO : makeBlocklist method & makeUserRender method 필요해....
	blockUser(io : Namespace, client : ChatSocket, target : string) {
		const thisUser = this.storeUser.findUserById(client.data.id);
		const targetId = this.storeUser.getIdByNickname(target);
		if (thisUser.blocklist.has(targetId))
			client.emit("sendAlert", "Notice", "You've already blocked this user");
		else {
			(thisUser.addUserToBlocklist(targetId));
			client.emit("sendAlert", "Notice", `Successfully block ${target}`);
			const blocklist = [];
			thisUser.blocklist.forEach((user) => 
					blocklist.push(this.storeUser.getNicknameById(user)));
			client.emit("sendBlocklist", blocklist);
		}
	}

	//TODO & CHECK unblockUser 할 때도 이렇게 하면 되나...?
	//이 경우에는 currRoomInfo, members 모두 보내줘야 하는거 아닌지...?
	unblockUser(io : Namespace, client : ChatSocket, target : string) {
		const thisUser = this.storeUser.findUserById(client.data.id);
		const targetId = this.storeUser.getIdByNickname(target);
		if (thisUser.blocklist.has(targetId)){
			(thisUser.deleteUserFromBlockList(targetId));
			client.emit("sendAlert", "Notice", `Successfully unblock ${target}`);
			const blocklist = [];
			thisUser.blocklist.forEach((user) => 
					blocklist.push(this.storeUser.getNicknameById(user)));
			client.emit("sendBlocklist", blocklist);
		}
		else {
			client.emit("sendAlert", "Failed", `${target} is not blocked yet`);
		}
	}

	//TODO : 이 모든 Getter들... 에러처리를 생각해야
	//TODO : array.map을 좀 더 열심히 사용해보자 : 여기는 map이라 못 쓰겠지만...
	getAllRoomList(userId : number) : roomInfo[] {
		const roomlist = [];
		const blocklist = this.storeUser.findUserById(userId).blocklist;
		this.storeRoom.rooms.forEach((value, key) => {
			if (!value.isPrivate)
				roomlist.push(key);
		})
		return (this.makeRoomInfo(blocklist, roomlist));
	}

	getUserRoomList(userId : number) : roomInfo[] {
		const thisUser = this.storeUser.findUserById(userId);
		return (this.makeRoomInfo(thisUser.blocklist, thisUser.joinlist));
	}

	getQueryRoomList(query : string | null) : queryResponseRoomInfo[] {
		const res = [];
		if (query === null || query.length === 0)
			return (res);
		const roomlist = this.storeRoom.findQueryMatchRoomNames(query);
		roomlist.forEach((roomname) => {
			const room = this.storeRoom.findRoom(roomname);
			const owner = this.storeUser.getNicknameById(room.owner);
			const userlist = Array.from(
					room.userlist, 
					(user) => this.storeUser.getNicknameById(user)
				);
			//TODO & CHECK : 모든 필드 필요한지?
			res.push({
				roomname : roomname,
				owner : owner,
				members : userlist
			})
		})
		return (res);
	}

	//TODO & CHECK : make DMform MessageFrom 함수 있으면 편하지 않을까
	fetchDM(io : Namespace, from : number, to : number, body : string){
		const message = new DM(from, to, body);
		const res = {
			from : this.storeUser.getNicknameById(from),
			body : body,
			at : message.at
		};
		this.storeMessage.saveMessage(message);
		io.to([`$${from}`, `$${to}`]).emit("sendDM", this.storeUser.getNicknameById(to), res);
	}

	makeDMRoomMessages(from : string, to : string) : formedMessage[] {
		const fromId = this.storeUser.getIdByNickname(from);
		const toId = this.storeUser.getIdByNickname(to);
		const msg = this.storeMessage
					.findMessagesForUser(fromId, toId)
					.map(message => ({
						from : this.storeUser.getNicknameById(message.from),
						to : this.storeUser.getNicknameById(message.to),
						body : message.body,
						at : message.at
					}));
		return (msg);
	}

	//이게 맞아...?
	makeUserStatus(userId : number, connection: boolean) : userInfo {
		const user = this.storeUser.findUserById(userId);
		const res = {
			id : userId,
			nickname : user.nickname,
			isGaming : user.isGaming,
			isConnected : user.connected
		}
		return (res);
	}
	
	// CHECK : Nick / Avatar 변경 시 member update/currRoom update 필요한지?
	// userUpdateNick(io : Server, userId : number, newNick : string) {
	// 	io.emit("updateUserNick", userId, newNick);
	// }

	// userUpdateAvatar(io : Server, userId : number){
	// 	io.emit("updateUserAvatar", userId);
	// }

	// userUpdateStatus(io : Server, userId : number, isConnected : boolean){
	// 	io.emit("updateUserStatus", userId, isConnected);
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

	//TODO : CHECK
	makeRoomUserInfo(roomname : string) : userInfo[] {
		const userInfo = [];
		//만약 여기서 못 찾으면?
		const room : Room = this.storeRoom.findRoom(roomname);
		//or 만약 방에 아무 유저도 없으면? <- datarace일 때 가능성 있다.
		room.userlist.forEach((user) => {
			const target : User = this.storeUser.findUserById(user);
			// if (target.connected = true){	//체크할 필요 없는게 맞다.. disconnect할때 다 지워줌
			userInfo.push({
				id : user,
				nickname : target.nickname,
				isGaming : target.isGaming
			})
			// }
		})
		return (userInfo);
	}

	//CHECK : at을 과연 쓸지...? -> 쓴다
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

	//TODO: 여기 유저 본인이 operator인지 owner인지 체크 필요
	makeCurrRoomInfo(roomname : string) : currRoomInfo {
		const room = this.storeRoom.findRoom(roomname);
		// console.log("make CurrRoomInfo : " + JSON.stringify(room));
		const owner = this.storeUser.getNicknameById(room.owner);	//왜 한번씩 여기서 오류가 나는지...?
		const operatorList = [];
		const joineduserList = [];
		room.userlist.forEach((user) => {
			joineduserList.push(this.storeUser.getNicknameById(user));
		})
		room.operators.forEach((user) => {
			operatorList.push(this.storeUser.getNicknameById(user));
		})
		const res = {
			roomname : roomname,
			owner : owner,
			operators : operatorList,
			joinedUsers : joineduserList,
			messages : this.mappingMessagesUserIdToNickname(room.messages),
			isPrivate : room.isPrivate,
			isProtected : room.password ? true : false
		}
		return (res)
	}

	//TODO & CHECK : 이거 쓸지 check
	async sendActResultToTarget(io : Namespace, roomname : string, target : number, operation: string){
		let notice : string;
		if (operation === "kick")
			notice = "Kicked out";
		else if (operation === "ban")
			notice = "Banned";
		else if (operation === "mute")
			notice = "Muted";
		const body = `You are ${notice} from Room "${roomname}"`
		await this.emitEventsToAllSockets(io, target, "sendMessage", roomname, {
				from : "server",
				body : body,
				at : Date.now()
		});
		// const sockets = await io.in(`$${target}`).fetchSockets();
		// sockets.forEach((socket) => {
		// 	socket.emit("sendMessage", "server", body);
		// })
	}

	//TODO : sendAlert message 분리하려면 이 함수에서 Socket 받아야함!
	//채팅방에서 어떤 행동을 할 때 가능한지 모두 체크 : 권한, 유효성, etc.
	checkActValidity(client : ChatSocket, roomname : string, actor : number, target : number) : boolean {
		if (actor === target) {
			// console.log("[ ACT ERROR ] you can't do sth to yourself")
			client.emit("sendAlert", "[ ACT ERROR ]", "you can't do sth to yourself")
			return (false);
		}
		const room = this.storeRoom.findRoom(roomname);
		if (room === undefined){
			// console.log("[ ACT ERROR ] Room does not exist")
			client.emit("sendAlert", "[ ACT ERROR ]", "Room does not exist")
			return (false);
		}
		const user = this.storeUser.findUserById(actor);
		if (user === undefined || !user.joinlist.has(roomname)){
			// console.log("[ ACT ERROR ] invalid Actor");
			client.emit("sendAlert", "[ ACT ERROR ]", "invalid Actor")
			return (false);
		}
		if (!room.isOwner(user.id) && !room.isOperator(user.id)){
			// console.log("[ ACT ERROR ] Actor is not authorized");
			client.emit("sendAlert", "[ ACT ERROR ]", "Actor is not authorized")
			return (false);
		}
		if (target === -1){
			// console.log("[ ACT ERROR ] Target does not exist")
			client.emit("sendAlert", "[ ACT ERROR ]", "Target does not exist")
			return (false);
		}
		else if (!room.isJoinning(target)){
			// console.log("[ ACT ERROR ] Target is not joining this room");
			client.emit("sendAlert", "[ ACT ERROR ]", "Target is not joining this room")
			return (false);
		}
		else if (room.isOwner(target)){	//가능하면 owner랑 operator를 enum으로 만들어서 값 비교로 권한 우위 확인하면 더 좋았을듯.... 지금은 귀찮아...
			// console.log("[ ACT ERROR ] Target is the Owner");
			client.emit("sendAlert", "[ ACT ERROR ]", "Target is the Owner")
			return (false);
		}
		else if (room.isOperator(target) && !room.isOwner(actor)){
			// console.log("[ ACT ERROR ] Only owner can do sth to Operator");
			client.emit("sendAlert", "[ ACT ERROR ]", "Only owner can do sth to Operator")
			return (false);
		}
		return (true);
	}

	//TODO : 되는지 확인
	async emitEventsToAllSockets(io : Namespace, targetId : number, eventname : string, args1? : any, args2? : any) : Promise<void> {
		const sockets = await io.in(`$${targetId}`).fetchSockets();
		sockets.forEach((socket) => {
			socket.emit(eventname, args1, args2);
		})
	}

	//CHECK : 좀 처리가 일관성이 없는게 joinlist도 persistent 하게 할지 말지 안 정해놓고 시작함ㅠ -> 주석 정리시 check
	getAllUserInfo(client : ChatSocket) {
		const users = this.storeUser.findAllUser();
		const res = [];
		users.forEach((user) => {
			res.push({
				id : user.id,
				nickname : user.nickname,
				isGaming : user.isGaming,
				isConnected : user.connected
			})
		});
		client.emit("responseAllMembers", res);
	}
}
