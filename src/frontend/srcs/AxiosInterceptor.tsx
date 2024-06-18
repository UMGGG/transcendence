import { JwtPayload } from "@/pages/callback";
import axios, { AxiosError } from "axios";
import {jwtDecode} from "jwt-decode";
import Router from "next/router";

async function refreshToken(): Promise<any> {
  console.log("in refresh");
  const res = await axios
    .get("http://localhost/api/auth/refresh", { withCredentials: true })
    .then((res) => {
      const access_token = res.data.access_token;
      localStorage.setItem("access_token", access_token);
      const jwtDecodes: JwtPayload = jwtDecode(access_token);
      localStorage.setItem("access_token_exp", jwtDecodes.exp.toString());
    })
    .catch(function (error) {
      if (error.response && error.response.status === 401) {
        getLogout();
        // window.location.href = "/";
        Router.push("/", undefined, { shallow : true });
      } else if (error.request) {
        console.log(error.request);
        getLogout();
        // window.location.href = "/";
        Router.push("/", undefined, { shallow : true });
      }
    });
  return res;
}

export async function getLogout(): Promise<any> {
  console.log("try logout!");
  alert("로그인 정보가 만료되었습니다");
  localStorage.setItem("isLoggedIn", "false");
  localStorage.removeItem("id");
  localStorage.removeItem("nickname");
  localStorage.removeItem("is2fa");
  localStorage.removeItem("access_token_exp");
  localStorage.removeItem("access_token");
  localStorage.removeItem("avatar");
  sessionStorage.removeItem("gamesocket");
}

const axiosApi = axios.create({
  baseURL: "http://localhost/api", //default url to call
  headers: { "Content-type": "application/json" }, //in case of img?
});

axiosApi.interceptors.request.use(async (request) => {
  console.log("axios request typeof :");
  console.log(typeof request);
  const jwtExpItem = localStorage.getItem("access_token_exp");
  if (jwtExpItem) {
    const jwtExpInt = parseInt(jwtExpItem);
    if (jwtExpInt * 1000 - Date.now() < 2000) await refreshToken();
  } else {
    // window.location.href = '/';
    console.log("here");
  }
  return request;
});

export default axiosApi;
