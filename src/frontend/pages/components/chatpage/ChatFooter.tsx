import { useState, useContext } from "react";
import { SocketContext } from "@/context/socket";
const ChatFooter = ({
  currentRoomName,
  isDM,
  DMtarget,
}: {
  currentRoomName: any;
  isDM: boolean;
  DMtarget: string;
}) => {
  const socket = useContext(SocketContext).chatSocket;
  const [textareaValue, setTextareaValue] = useState("");
  function handleSubmit(e: any) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const formJson = Object.fromEntries(formData.entries());
    console.log("버튼 누를때?in handle1 e", formJson.textareaContent);
    if (!isDM) {
      console.log(
        `in footer1, isDM:${isDM} target:${DMtarget} message:${formJson.textareaContent}`
      );
      socket.emit("sendChatMessage", currentRoomName, formJson.textareaContent);
    } else if (isDM) {
      socket.emit("sendDirectMessage", DMtarget, formJson.textareaContent);
      console.log(
        `in footer2 isDM:${isDM} target:${DMtarget} message:${formJson.textareaContent}`
      );
    }
    setTextareaValue("");
  }
  function handleSubmit2(e: any) {
    // Prevent the browser from reloading the page
    e.preventDefault();
    console.log("엔터칠때?in handl2 e", textareaValue);
    if (!isDM) {
      console.log(
        `in footer11, isDM:${isDM} target:${DMtarget} message:${textareaValue}`
      );
      socket.emit("sendChatMessage", currentRoomName, textareaValue);
    } else if (isDM) {
      socket.emit("sendDirectMessage", DMtarget, textareaValue);
      console.log(
        `in footer22 isDM:${isDM} target:${DMtarget} message:${textareaValue}`
      );
    }
    setTextareaValue("");
  }
  const handleOnKeyPress = (e: any) => {
    if (e.isComposing || e.keyCode === 229) {
      console.log("twice eror!!!");
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit2(e); // Enter 입력이 되면 클릭 이벤트 실행
    }
  };
  return (
    <form
      className="chat-message-footer"
      method="post"
      onSubmit={handleSubmit}
      onKeyDown={handleOnKeyPress}
    >
      <textarea
        name="textareaContent"
        rows={4}
        cols={33}
        className="input2"
        value={textareaValue}
        onChange={(e) => setTextareaValue(e.target.value)}
      />
      <button type="submit"> Send </button>
    </form>
  );
};

export default ChatFooter;
