import { useEffect, useState, createContext } from "react";

import * as io from "socket.io-client";
import { Socket } from "socket.io-client";
import ModalBasic from "./components/modalpage/modal";
import ModalOverlay from "./components/modalpage/ModalOverlay";
import TempLogin from "./components/temploginpage/tempLogin";
import NavBar from "./components/navpage/NavBar";
import GameList from "./components/gamelistpage/GameList";
import ChatMain from "./components/chatpage/ChatMain";
import SearchList from "./components/searchlistpage/SearchList";
import ChatRoomUser from "./components/chatroompage/ChatRoom";
import Pong from "@/srcs/Pong";
// import { SocketContext, socket } from "../context/socket";
// import searchIcon from "./assets/search.png";
import Image from "next/image";
import TempRandomMatch from "@/srcs/TempRandomMatch";

export type SocketContent = {
  chatSocket: any;
  gameSocket: any;
};
export const SocketContext = createContext<SocketContent>({
  chatSocket: null,
  gameSocket: null,
});

export type AppContent = {
  gameSocket: any;
};
export const AppContext = createContext<AppContent>({
  gameSocket: null,
});

export type UserOnChat = {
  id: string;
  isCreator: boolean;
  isOp: boolean;
};

export type TempSearch = {
  roomname: string;
  lastMessage: string;
  lastMessageFrom: string;
  messageNew: boolean;
  users: UserOnChat[];
};

export default function App() {
  const [tmpLoginID, setTmpLoginID] = useState<string>("");
  const [tmpLoginnickname, setTmpLoginnickname] = useState<string>("");
  const [tmpIsLoggedIn, setTmpIsLoggedIn] = useState<boolean>(false);

  const [results, setTempSearchList] = useState<TempSearch[]>([]);
  const [query, setQuery] = useState("");
  const [roomUserList, setRoomUserList] = useState<any>(null);

  const [roomnameModal, setroomnameModal] = useState<string>("");
  const [currentRoomName, setcurrentRoomName] = useState<string>("");
  const [leftHeader, setLeftHeader] = useState<string>("");
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [messages, setMessages] = useState<any>([]);
  const [roomInfo, setRoomInfo] = useState<any>(null);
  const [blocklist, setBlocklist] = useState<any>([]);

  // seunchoi - for socket connection
  const [gameLoad, setGameLoad] = useState<boolean>(false);
  // Get Empty Socket Instance
  const [socket, setSocket] = useState<Socket>(
    io.connect("", { query: { nickname: "" } })
  );
  const [gameSocket, setGameSocket] = useState<Socket>(
    io.connect("", { query: { nickname: "" } })
  );

  useEffect(() => {
    const getSocket = (namespace: string, jwt: string, nickname: string) => {
      return io.connect(`http://localhost/${namespace}`, {
        query: { nickname: nickname },
        auth: { token: jwt },
      });
    };

    const nicknameItem = localStorage.getItem("nickname");
    const loginIdItem = localStorage.getItem("id");
    if (nicknameItem && loginIdItem) {
      setTmpLoginnickname(nicknameItem);
      setTmpLoginID(loginIdItem);
      setTmpIsLoggedIn(true);
      console.log(
        `in first useEffect nickname : ${nicknameItem} id: ${loginIdItem}`
      );
    }
    const jwtItem = localStorage.getItem("access_token");

    // Run whenever jwt state updated
    if (nicknameItem && jwtItem) {
      console.log("Try Web Socket Connection");
      setSocket(getSocket("chat", jwtItem, nicknameItem));
      setGameSocket(getSocket("game", jwtItem, nicknameItem));
    }
  }, []);

  useEffect(() => {
    function sendBlocklist(result: any) {
      console.log("sendBlocklist update + " + JSON.stringify(result));
      setBlocklist(() => result);
    }
    function updateBlocklist(target: string) {
      console.log("updateBlocklist update");
      setBlocklist(() => [...blocklist, target]);
    }
    function sendRoomMembers(result: any) {
      console.log(
        "in useEffect sendRoomMembers zzzzz",
        JSON.stringify(result, null, 2)
      );

      setRoomUserList(() => result);
      setLeftHeader(() => "joined");
      // setcurrentRoomName(() => result[0].roomname);
      setQuery("");
    }

    function sendMessage(roomname: string, data: any) {
      console.log(
        `in useEffect sendMessage ??111  from<${
          data?.from
        }> roomname<${roomname}> body<${JSON.stringify(
          data,
          null,
          2
        )}> 내 방은 <${currentRoomName}>`
      );

      setTempSearchList((results) => {
		const theblocklist = blocklist;
		console.log("theblocklist = " + JSON.stringify(theblocklist));
        return results.map((result) => {
			console.log(result.users)
			const isNotBanned = 
				(blocklist.find(
					(user : string) => { user === data.from })
				) ? false : true;
			console.log(isNotBanned);
			console.log("inside temSearch" + JSON.stringify(blocklist));	
          if (result.roomname === roomname && isNotBanned) {
            result.lastMessage = `${data.body}`;
            result.lastMessageFrom = data.from;
            if (roomname === currentRoomName) {
              result.messageNew = false;
            } else {
              result.messageNew = true;
            }
          }
          return result;
        });
      });
      if (roomname === currentRoomName) {
        console.log("same room!", currentRoomName, roomname);
        setMessages(() => [...messages, data]);
      }
    }
    function sendDM(from: string, data: any) {
      console.log(
        `in useEffect sendDM  from<${from}> data<${JSON.stringify(
          data,
          null,
          2
        )}> 내 방은 <${currentRoomName}>`
      );
      if (
        from === currentRoomName ||
        (from === tmpLoginnickname && data.from === currentRoomName)
      ) {
        console.log("same froom!", currentRoomName, from);
        setMessages(() => [...messages, data]);
      }
    }
    function youAreKickedOut(result: any) {
      console.log(
        "in useEffect youAreKickedOut",
        JSON.stringify(result, null, 2)
      );
    }
    function youAreBanned(result: any) {
      console.log("in useEffect youAreBanned", JSON.stringify(result, null, 2));
    }
    function wrongPassword(result: any) {
      console.log(
        "in useEffect wrongPassword",
        JSON.stringify(result, null, 2)
      );
    }
    function sendAlert(alertTitle: string, alertBody: string) {
      console.log(
        "in useEffect sendAlert",
        alertTitle,
        JSON.stringify(alertBody, null, 2)
      );
    }

    if (socket) {
      socket.on("sendBlocklist", sendBlocklist);
      socket.on("updateBlocklist", updateBlocklist);
      socket.on("youAreKickedOut", youAreKickedOut);
      socket.on("youAreBanned", youAreBanned);
      socket.on("wrongPassword", wrongPassword);
      socket.on("sendAlert", sendAlert);
      socket.on("sendDM", sendDM);
      socket.on("sendMessage", sendMessage);
      socket.on("sendRoomMembers", sendRoomMembers);
    }

    return () => {
      if (socket) {
        socket.off("sendBlocklist", sendBlocklist);
        socket.off("updateBlocklist", updateBlocklist);
        socket.off("youAreKickedOut", youAreKickedOut);
        socket.off("youAreBanned", youAreBanned);
        socket.off("wrongPassword", wrongPassword);
        socket.off("sendAlert", sendAlert);
        socket.off("sendMessage", sendMessage);
        socket.off("sendRoomMembers", sendRoomMembers);
        socket.off("sendDM", sendDM);
      }
    };
  }, [currentRoomName, results, messages, socket, blocklist]);

  const handleGameOnOff = () => {
    setGameLoad(!gameLoad);
  };

  return (
    <SocketContext.Provider
      value={{
        chatSocket: socket,
        gameSocket: gameSocket,
      }}
    >
      {
        <>
          <ModalOverlay isOpenModal={isOpenModal} />
          <div>
            {isOpenModal && (
              <ModalBasic
                roomname={roomnameModal}
                setIsOpenModal={setIsOpenModal}
                innerText={"방클릭해서 드갈때 비번입력 ㄱ"}
              />
            )}
          </div>
          {/* seunchoi - TEST */}
          <button onClick={handleGameOnOff}>game on/off</button>
          {gameLoad && <TempRandomMatch />}
          <NavBar
            query={query}
            setQuery={setQuery}
            setIsLoading={setIsLoading}
            setTmpLoginnickname={setTmpLoginnickname}
            setLeftHeader={setLeftHeader}
            setError={setError}
          />
          <Main>
            <Box>
              {
                <>
                  <SearchList
                    results={results}
                    query={query}
                    setTempSearchList={setTempSearchList}
                    isOpenModal={isOpenModal}
                    setIsOpenModal={setIsOpenModal}
                    leftHeader={leftHeader}
                    setLeftHeader={setLeftHeader}
                    setroomnameModal={setroomnameModal}
                    blocklist={blocklist}
                  />
                  <DMlist />
                </>
              }
            </Box>
            {gameLoad ? (
              <Pong />
            ) : (
              <ChatMain
                roomInfo={roomInfo}
                setRoomInfo={setRoomInfo}
                messages={messages}
                setMessages={setMessages}
                currentRoomName={currentRoomName}
                setcurrentRoomName={setcurrentRoomName}
                myNickName={tmpLoginnickname}
                blocklist={blocklist}
              />
            )}
            <Box>
              <>
                <ChatRoomUser
                  id={tmpLoginID}
                  blocklist={blocklist}
                  roomInfo={roomInfo}
                  setRoomInfo={setRoomInfo}
                  users={roomUserList}
                  roomname={currentRoomName}
                  myNickName={tmpLoginnickname}
                />
                <GameList myNickName={tmpLoginnickname} />
              </>
            </Box>
          </Main>
        </>
      }
    </SocketContext.Provider>
  );
}

function DMlist() {
  return (
    <div className="dmlist-header">
      <h4>DM-List</h4>
    </div>
  );
}

function Main({ children }: { children: any }) {
  return <main className="main">{children}</main>;
}

function Box({ children }: { children: any }) {
  return <div className="box">{children}</div>;
}
