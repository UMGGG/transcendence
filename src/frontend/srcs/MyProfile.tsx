import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import axiosApi from "./AxiosInterceptor";
import axios from "axios";
import {jwtDecode} from "jwt-decode";
import "../pages/index.css";
import styles from "../styles/MyProfileStyle.module.css";
import { JwtPayload } from "@/pages/callback";

function MyProfile({
  setIsOpenModal,
  setTmpLoginnickname,
}: {
  setIsOpenModal: any;
  setTmpLoginnickname: any;
}) {
  const [newNickname, setNewNickname] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [QRUrl, setQRUrl] = useState<string>(" ");
  const [userNickname, setUserNickname] = useState<string | null>(
    localStorage.getItem("nickname")
  );
  const [userId, setUserID] = useState<string | null>(
    localStorage.getItem("id")
  );
  const [avatarURL, setAvatarURL] = useState<string | null>(
    localStorage.getItem("avatar")
  );
  const [is2Fa, setIs2Fa] = useState<string | null>(
    localStorage.getItem("is2fa")
  );
  const [checkIs2Fa, setCheckIs2Fa] = useState<boolean>(is2Fa === "true");
  const [verCode, setVerCode] = useState("");

  const closeModal = () => {
    setIsOpenModal(false);
  };
  const modalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    // 이벤트 핸들러 함수
    const handler = () => {
      console.log("in myprofile handler");
      if (!event) return;
      // mousedown 이벤트가 발생한 영역이 모달창이 아닐 때, 모달창 제거 처리
      const target = event.target as HTMLInputElement;
      if (modalRef.current && !modalRef.current.contains(target)) {
        setIsOpenModal(false);
      }
    };

    // 이벤트 핸들러 등록
    document.addEventListener("mousedown", handler);
    // document.addEventListener('touchstart', handler); // 모바일 대응

    return () => {
      // 이벤트 핸들러 해제
      document.removeEventListener("mousedown", handler);
      // document.removeEventListener('touchstart', handler); // 모바일 대응
    };
  },[]);

  function logout(message:string){
    localStorage.setItem("isLoggedIn", "false");
          localStorage.removeItem("id");
          localStorage.removeItem("nickname");
          localStorage.removeItem("is2fa");
          localStorage.removeItem("access_token");
          localStorage.removeItem("access_token_exp");
          localStorage.removeItem("avatar");
          sessionStorage.removeItem("gamesocket");
          const ApiUrl = "http://localhost/api/auth/logout";
          axiosApi.post(ApiUrl, {}).catch((error:any) => {
            console.log("logout send fail: ", error); //TODO: error handling check
          });
          alert(message);
          router.push("/", undefined, { shallow : true });
  }

  async function refreshToken() : Promise<any> {
    console.log("토큰 재발급");
    await axios.get(
      'http://localhost/api/auth/refresh',
      { withCredentials: true }
      ).then((response)=>{
        const resData = response.data;
        localStorage.setItem("access_token",resData.access_token);
        const jwtDecodes: JwtPayload = jwtDecode(resData.access_token);
        localStorage.setItem("access_token_exp", jwtDecodes.exp.toString());
        setQRUrl("http://localhost/api/2fa/qrcode");
      })
      .catch((error:any) => {
              console.log("Axios Error type : ");
              console.log(typeof error);
        if (error.response.status === 401) {
          logout("로그인 정보가 맞지않습니다 다시 로그인해주세요.")
        }
      })
  }

  useEffect(() => {
    const jwtExpItem = localStorage.getItem("access_token_exp");
		if (jwtExpItem){
			const jwtExpInt = parseInt(jwtExpItem);
			if (jwtExpInt * 1000 - Date.now() < 2000)
				refreshToken();
      else
        setQRUrl("http://localhost/api/2fa/qrcode");
		}
    else{
      logout("로그인 정보가 맞지않습니다 다시 로그인해주세요.");
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setImageUrl(URL.createObjectURL(file));
    }
  };

  async function fixProfile() {
    const apiUrl = "http://localhost/api/user/" + userId;

    if (newNickname !== "" && newNickname !== userNickname) {
      if (newNickname.length >= 12) {
        alert("닉네임의 길이는 최대 12자 입니다");
        setNewNickname("");
        return;
      }
      const dataToUpdate = {
        id: userId,
        nickname: newNickname,
      };
      await axiosApi
        .patch(apiUrl, JSON.stringify(dataToUpdate), {
          headers: {
            "Content-Type": "application/json",
          },
        })
        .then((response) => {
          if (response.data.error) {
            alert(
              "닉네임 변경에 실패했습니다. 새로운 닉네임으로 다시 시도해주세요"
            );
            setNewNickname("");
          } else {
            setUserNickname(newNickname);
            localStorage.setItem("nickname", newNickname);
            setTmpLoginnickname(newNickname);
            console.log("naickname 변경 성공 데이터:", response.data);
            alert("닉네임이 변경되었습니다");
          }
        })
        .catch((error) => {
          alert("닉네임 변경에 실패했습니다");
          setNewNickname("");
        });
    }
    if (selectedFile) {
      const formData = new FormData();
      formData.append("avatar", selectedFile);
      try{
        await axiosApi.post(apiUrl, formData,{
          headers: {
          "Content-Type": "multipart/form-data",
        }})
        .then((response:any) => {
            console.log(response);
            if (response.status != 201){
              throw(response);
            }
            console.log("profile 변경 응답 데이터:", response.data);
            localStorage.setItem("avatar", `/api/user/${userId}/photo?timestamp=${Date.now()}`,);
            setAvatarURL(`/api/user/${userId}/photo?timestamp=${Date.now()}`);
            console.log("URL change: " + avatarURL);
            setImageUrl(null);
            setSelectedFile(null);
            alert("프로필 사진이 변경되었습니다");
          })
        .catch((error:any) => {
          alert("이미지 업로드에 실패했습니다.");
          throw(error);
        })
      }
      catch(error){
        console.log("이미지 업로드 실패: ", error);
      }
    }

    if (is2Fa === "false" && checkIs2Fa === true) {
      const jwtExpItem = localStorage.getItem("access_token_exp");
      if (jwtExpItem){
        const jwtExpInt = parseInt(jwtExpItem);
        if (jwtExpInt * 1000 - Date.now() < 2000)
          await refreshToken();
      }
       try{
          if (verCode == '' || verCode.length !== 6){
            throw("인증코드를 확인해주세요");
          }
          const faChangeApiUrl = 'http://localhost/api/2fa/turn-on';
          const dataToUpdate = {
            id: userId,
            twoFactorAuthCode: verCode
          };
          console.log("2fa send data: ", JSON.stringify(dataToUpdate));
          await fetch(faChangeApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataToUpdate),
          })
          .then(async(response)=>{
            const responseData = await response.json();
            if (responseData.error){
              throw new Error(responseData.error);
            }
            if (responseData.message == "2fa turn on"){
              localStorage.setItem("is2fa", 'true');
              setIs2Fa('true');
              alert("2차인증이 설정되었습니다 다시 로그인해주세요.");
              setVerCode('');
              console.log('is2fa 변경 응답 데이터:', responseData);
              localStorage.setItem("isLoggedIn", "false");
              localStorage.removeItem("id");
              localStorage.removeItem("nickname");
              localStorage.removeItem("is2fa");
              localStorage.removeItem("access_token");
              localStorage.removeItem("access_token_exp");
              localStorage.removeItem("avatar");
              sessionStorage.removeItem("gamesocket");
              const ApiUrl = "http://localhost/api/auth/logout";
              axiosApi.post(ApiUrl, {}).catch((error:any) => {
                console.log("logout send fail: ", error); //TODO: error handling check
              });
              router.push("/", undefined, { shallow : true });
            }
            else{
              alert("다시 시도해주세요.");
            }
            })
        }
        catch(error){
          alert("qr인증에 실패했습니다, 코드 또는 OTP인증을 확인해주세요");
          setVerCode('');
        }
    } else if (is2Fa === "true" && checkIs2Fa === false) {
      const jwtExpItem = localStorage.getItem("access_token_exp");
      if (jwtExpItem){
        const jwtExpInt = parseInt(jwtExpItem);
        if (jwtExpInt * 1000 - Date.now() < 2000)
          await refreshToken();
      }
    try{
        if (verCode == '' || verCode.length !== 6){
          throw("인증코드를 확인해주세요");
        }
        const faChangeApiUrl = 'http://localhost/api/2fa/turn-off';
        const dataToUpdate = {
          id: userId,
          twoFactorAuthCode: verCode
        };
        console.log("2fa send data: ", JSON.stringify(dataToUpdate));
        await fetch(faChangeApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dataToUpdate),
        })
        .then(async(response)=>{
          const responseData = await response.json();
          if (responseData.error){
            throw new Error(responseData.error);
          }
          localStorage.setItem("is2fa", 'false');
          setIs2Fa('false');
          alert("2차인증이 해제되었습니다");
          setVerCode('');
          console.log('is2fa 변경 응답 데이터:', responseData);
        })
        .catch((error) => {
          throw(error);
        })
      }
      catch(error){
        alert("qr인증에 실패했습니다, 코드 또는 OTP인증을 확인해주세요");
        setVerCode('');
      }
    }
  }

  return (
    <div ref={modalRef} className="modal modal-myprofile">
      <div className={styles.profileMainBox}>
        <div>
          <h2>내 프로필</h2>
        </div>
        <div>
          <br/>
          <br/>
          닉네임
          <br/>
          {userNickname !== null ?
          (<input className={styles.nicknameInput} placeholder={userNickname} type="text" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} />)
          :
          (<input className={styles.nicknameInput} type="text" value={newNickname} onChange={(e) => setNewNickname(e.target.value)} />)}
        </div>
        <div>
          프로필 사진
          <br/>
        </div>
        <div className={styles.profilePicSetBox}>
          <input type="file" accept='image/*' onChange={handleFileChange}></input>
          {imageUrl && (
          <img src={imageUrl} alt="profile image" className={styles.selectProfileImage}/>)}
          {!imageUrl && avatarURL && (
          <img src={avatarURL} className={styles.selectProfileImage} ></img>
          )}
        </div>
        <div>
          2차인증 여부
          <br/>
          <input type="checkbox" id="toggle" name="toggle" onChange={() => setCheckIs2Fa(!checkIs2Fa)} checked={checkIs2Fa} hidden />
          <label htmlFor="toggle" className={styles.toggleSwitch}>
              <span className={styles.toggleButton}></span>
          </label>
          <div className={styles.OTPAlert}>
              {(is2Fa === 'true' && checkIs2Fa === false || is2Fa === 'false' && checkIs2Fa === true) && (
                <>
                  <div>
                    {QRUrl != ' ' &&(
                      <img
                      src={QRUrl}
                      alt="qr image"
                      width="150"
                      height="150"
                      onError={(e: React.SyntheticEvent<HTMLImageElement>) => e.currentTarget.style.display = 'none'}
                      />
                      )}
                  </div>
                  <span>변경사항 적용을 위해 구글 OTP 코드를 입력하세요</span>
                  <div>
                    <input className={styles.nicknameInput} placeholder="띄워쓰기 제외한 6자리" type="text" value={verCode} onChange={(e) => setVerCode(e.target.value)} />
                  </div>
                </>
              )}
              {(is2Fa === 'true' && checkIs2Fa === true || is2Fa === 'false' && checkIs2Fa === false) && (
                  <br/>
              )}
          </div>
        </div>
        <button className={styles.Button} onClick={fixProfile}>저장</button>
      </div>
    </div>
)}

export default MyProfile;
