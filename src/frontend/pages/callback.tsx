import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {jwtDecode} from "jwt-decode";
import styles from "../styles/CallBackStyle.module.css";

export type JwtPayload = {
  id: number;
  email: string;
  iat: number;
  exp: number;
}

function Callback() {
  const router = useRouter();
  const [showCodeInput, setShowCodeInput] = useState<boolean>(false);
  const [verCode, setVerCode] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState<Boolean>(false);

  const code = router.query.code as string;

useEffect( () => {
  if(isReady){
    router.push("Home", undefined, { shallow : true });
  }
}, [isReady])

  const authLogin = async () => {
    setIsReady(false);
    const response = await fetch(
      "http://localhost/api/auth/login?code=" + code
    );
    // const response = await(await fetch('http://localhost/api/auth/login?code=' + code)).json();

    if (!response.ok) {
      alert("다시 시도해주세요");
      router.push("/", undefined, { shallow : true });
    } else if (response.status === 500) {
      alert("다시 시도해주세요");
      router.push("/", undefined, { shallow : true });
    }

    const data = await response.json();

    console.log(data);
    localStorage.setItem("nickname", data.nickname);
    localStorage.setItem("id", data.id);
    if (data.isNewUser){
      alert(`당신의 닉네임은 ${data.nickname} 입니다 \n 닉네임과 아바타를 변경하려면 메인페이지의 MY 버튼을 눌러주세요.`);
    }
    sessionStorage.setItem("gamesocket", "false");
    setUserId(data.id);
    if (data.is2faEnabled === false) {
      const detailResponse = await (
        await fetch("http://localhost/api/user/" + data.id)
      ).json();
      localStorage.setItem("access_token", data.access_token);
      // Decode token to get expired time
      const jwtDecodes: JwtPayload = jwtDecode(data.access_token);
      localStorage.setItem("access_token_exp", jwtDecodes.exp.toString());
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("is2fa", "false");
      localStorage.setItem("avatar",`/api/user/${data.id}/photo?timestamp=${Date.now()}`);
      setIsReady(true);
    } else if (data.is2faEnabled === true) {
      setShowCodeInput(true);
      localStorage.setItem("is2fa", "true");
    }
  };

  useEffect(() => {
    const storedIsLoggedIn = localStorage.getItem("isLoggedIn");
    if (storedIsLoggedIn === "true") {
      console.log("already logedin");
      setIsReady(true);
      return;
    } else if (!router.isReady) return;
    authLogin();
    console.log("Callback Page");
  }, [router.isReady]);

  async function sendAuthCode(code: string) {
    const authcode = code;
    setVerCode("");
    if (authcode.length !== 6) {
      // 코드 길이 확인
      alert("OTP 코드를 다시 확인해주세요");
      return;
    }
    const apiUrl = "http://localhost/api/2fa/authenticate";
    const dataToUpdate = {
      // 업데이트하고자 하는 데이터 객체
      id: userId,
      twoFactorAuthCode: authcode,
    };
    console.log(dataToUpdate);
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToUpdate),
      });
      if (!response.ok) {
        throw "인증 실패";
      }
      const responseData = await response.json();
      if (responseData.status == 401) {
        throw "인증에 실패했습니다 코드를 다시 확인해주세요";
      }
      console.log("인증 결과:", responseData);
      localStorage.setItem("access_token", responseData.access_token);
      const jwtDecodes: JwtPayload = jwtDecode(responseData.access_token);
      localStorage.setItem("access_token_exp", jwtDecodes.exp.toString());
      localStorage.setItem("avatar", `/api/user/${userId}/photo?timestamp=${Date.now()}`);
      localStorage.setItem("isLoggedIn", "true");
      setIsReady(true);
    } catch (error) {
      alert("인증 오류: " + error);
    }
  }

  return (
    <div className={styles.mainBox}>
      {showCodeInput === false && (
        <div className={styles.innerBox}>
          <div className={styles.title}>로딩중...</div>
        </div>
      )}
      {showCodeInput === true && (
        <div className={styles.innerBox}>
          <div className={styles.title2}>OTP 인증번호 6자리를 입력해주세요</div>
          <div>
            <input
              className={styles.input}
              placeholder="띄워쓰기 제외한 6자리"
              type="text"
              value={verCode}
              onChange={(e) => setVerCode(e.target.value)}
            />
          </div>
          <div>
            <button
              className={styles.button}
              onClick={() => sendAuthCode(verCode)}
            >
              인증
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Callback;
