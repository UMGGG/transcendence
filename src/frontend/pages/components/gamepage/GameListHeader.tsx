import { useState, useEffect } from "react";

export default function GameListHeader({
  tmpLoginnickname,
  page,
  setPage,
  leftArrow,
  rightArrow,
}: {
  tmpLoginnickname: string;
  page: number;
  setPage: any;
  leftArrow: boolean;
  rightArrow: boolean;
}) {
  return (
    <div className="gamelist-header">
      <h4>{tmpLoginnickname} 님의 Game-List</h4>

      <button
        onClick={() => setPage(() => page - 1)}
        className={`btn-page ${leftArrow ? "" : "visible"}`}
      >
        &larr;
      </button>
      <button
        onClick={() => setPage(() => page + 1)}
        className={`btn-page ${rightArrow ? "" : "visible"}`}
      >
        &rarr;
      </button>
    </div>
  );
}
