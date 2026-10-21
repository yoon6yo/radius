// Temporary Stage 1 direction mocks (?dir=1|2|3). Deleted after the pick.
const PEERS = [
  { name: "노란 여우", os: "Android", state: "send", pct: 62, done: "2.6 GB", total: "4.2 GB", speed: "38 MB/s", eta: "남은 시간 약 1분" },
  { name: "붉은 사슴", os: "Windows", state: "idle" },
  { name: "초록 부엉이", os: "iPhone", state: "idle" },
] as const;

const CSS = `
.m{--bg:#fff;--ink:#0b1b3a;--sub:#4a5b7a;--line:#d6e2f5;--pri:#1f5fe0;--soft:#eaf1fd;min-height:100vh;font-family:"Geist Variable","Pretendard Variable","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;background:var(--bg);color:var(--ink)}
.m *{box-sizing:border-box}
/* 1 하늘 */
.d1{--bg:#f4f8ff;--soft:#e4eeff}
.d1 .wrap{max-width:30rem;margin:0 auto;padding:1.5rem 1.25rem 2rem;display:flex;flex-direction:column;min-height:100vh}
.d1 header{display:flex;justify-content:space-between;align-items:center}
.d1 .brand{font-weight:700;letter-spacing:-.02em;font-size:1.25rem}
.d1 .live{font-size:.8125rem;color:var(--sub);display:flex;gap:.4rem;align-items:center}
.d1 .live i{width:.5rem;height:.5rem;border-radius:50%;background:#1f9d6b}
.d1 .radar{position:relative;flex:1;min-height:22rem;margin:1.5rem 0}
.d1 .ring{position:absolute;left:50%;top:50%;border:1px solid #c5d6f2;border-radius:50%;transform:translate(-50%,-50%)}
.d1 .me{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:5.5rem;height:5.5rem;border-radius:50%;background:var(--pri);color:#fff;display:grid;place-items:center;font-weight:600;font-size:.875rem;text-align:center;box-shadow:0 8px 24px -8px rgba(31,95,224,.55)}
.d1 .peer{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:.4rem;font-size:.8125rem}
.d1 .bub{width:4.25rem;height:4.25rem;border-radius:50%;background:#fff;border:1px solid var(--line);display:grid;place-items:center;box-shadow:0 6px 18px -10px rgba(11,27,58,.35);font-weight:600;color:var(--pri)}
.d1 .prog{position:relative;width:4.25rem;height:4.25rem}
.d1 .foot{border-top:1px solid var(--line);padding-top:1rem;font-size:.875rem;color:var(--sub)}
.d1 .foot b{color:var(--ink);display:block;font-size:1rem;margin-bottom:.15rem}
/* 2 심해: 짙은 푸른 상단 셸 + 밝은 시트 */
.d2{--bg:#eef3fb;--pri:#2a6cf0}
.d2 .top{background:#0c2a66;color:#fff;padding:1.5rem 1.25rem 4.5rem}
.d2 .top .in{max-width:34rem;margin:0 auto}
.d2 .top small{color:#a9c1f0;font-size:.8125rem}
.d2 .top h1{font-size:1.5rem;margin:.35rem 0 0;letter-spacing:-.02em}
.d2 .sheet{max-width:34rem;margin:-3rem auto 0;background:#fff;border-radius:1.25rem 1.25rem 0 0;padding:1.25rem;min-height:70vh;box-shadow:0 -10px 30px -18px rgba(12,42,102,.5)}
.d2 .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem;margin-top:1rem}
.d2 .tile{border:1px solid var(--line);border-radius:1rem;padding:1rem;min-height:7.5rem;display:flex;flex-direction:column;justify-content:space-between}
.d2 .tile.on{grid-column:1/-1;background:#0c2a66;color:#fff;border-color:#0c2a66}
.d2 .tile .os{font-size:.75rem;color:var(--sub)}
.d2 .tile.on .os{color:#a9c1f0}
.d2 .bar{height:.5rem;border-radius:99px;background:rgba(255,255,255,.2);overflow:hidden;margin:.75rem 0 .4rem}
.d2 .bar i{display:block;height:100%;background:#7fb0ff}
.d2 .drop{margin-top:1rem;border:1.5px dashed #9bb8ec;border-radius:1rem;padding:1rem;text-align:center;color:var(--sub);font-size:.875rem}
/* 3 잉크: 리스트, 큰 숫자 */
.d3{--bg:#fff;--pri:#1740b8;--soft:#eef2ff;--line:#cfd8ee}
.d3 .wrap{max-width:36rem;margin:0 auto;padding:1.5rem 1.25rem}
.d3 .head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--ink);padding-bottom:.75rem}
.d3 .head b{font-size:1.5rem;letter-spacing:-.03em;color:var(--pri)}
.d3 .row{position:relative;display:grid;grid-template-columns:1fr auto;gap:.25rem 1rem;align-items:center;padding:1.1rem 0;border-bottom:1px solid var(--line);overflow:hidden}
.d3 .row .fill{position:absolute;inset:0 auto 0 0;background:var(--soft);z-index:0}
.d3 .row>*{position:relative;z-index:1}
.d3 .row .n{font-size:1.125rem;font-weight:600}
.d3 .row .meta{font-size:.8125rem;color:var(--sub)}
.d3 .row .big{font-size:2rem;font-weight:700;color:var(--pri);font-variant-numeric:tabular-nums;grid-row:1/3;grid-column:2}
.d3 .row .go{grid-column:2;font-size:.875rem;color:var(--pri);font-weight:600}
.d3 .hint{margin-top:1.25rem;font-size:.875rem;color:var(--sub)}
`;

const ring = (r: number) => ({ width: `${r}rem`, height: `${r}rem` });

function Dir1() {
  const pos = [
    { l: "76%", t: "24%" },
    { l: "22%", t: "36%" },
    { l: "62%", t: "80%" },
  ];
  return (
    <div className="m d1">
      <div className="wrap">
        <header>
          <span className="brand">Radius</span>
          <span className="live"><i />연결됨</span>
        </header>
        <div className="radar">
          {[8, 14, 20].map((r) => <div key={r} className="ring" style={ring(r)} />)}
          <div className="me">푸른 고래<br />(내 기기)</div>
          {PEERS.map((p, i) => (
            <div key={p.name} className="peer" style={{ left: pos[i]!.l, top: pos[i]!.t }}>
              {p.state === "send" ? (
                <div className="prog">
                  <svg viewBox="0 0 68 68" width="68" height="68"><circle cx="34" cy="34" r="31" fill="#fff" stroke="#d6e2f5" strokeWidth="4" /><circle cx="34" cy="34" r="31" fill="none" stroke="#1f5fe0" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${0.62 * 194.8} 194.8`} transform="rotate(-90 34 34)" /><text x="34" y="39" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1f5fe0">62%</text></svg>
                </div>
              ) : (
                <div className="bub">{p.name[0]}</div>
              )}
              <span>{p.name}</span>
            </div>
          ))}
        </div>
        <div className="foot"><b>노란 여우에게 보내는 중</b>2.6 GB / 4.2 GB · 38 MB/s · 남은 시간 약 1분</div>
      </div>
    </div>
  );
}

function Dir2() {
  return (
    <div className="m d2">
      <div className="top"><div className="in"><small>내 기기</small><h1>푸른 고래 · 연결됨</h1></div></div>
      <div className="sheet">
        <strong>근처 기기 3대</strong>
        <div className="grid">
          <div className="tile on">
            <div><div className="os">Android</div><b style={{ fontSize: "1.125rem" }}>노란 여우</b></div>
            <div>
              <div className="bar"><i style={{ width: "62%" }} /></div>
              <div style={{ fontSize: ".8125rem", color: "#a9c1f0" }}>2.6 GB / 4.2 GB · 38 MB/s · 남은 시간 약 1분</div>
            </div>
          </div>
          {PEERS.slice(1).map((p) => (
            <div key={p.name} className="tile"><div className="os">{p.os}</div><b>{p.name}</b><span style={{ color: "#1f5fe0", fontSize: ".875rem", fontWeight: 600 }}>탭해서 보내기</span></div>
          ))}
        </div>
        <div className="drop">파일을 여기로 끌어다 놓으면 선택한 기기로 보내요</div>
      </div>
    </div>
  );
}

function Dir3() {
  return (
    <div className="m d3">
      <div className="wrap">
        <div className="head"><b>Radius</b><span style={{ fontSize: ".875rem", color: "var(--sub)" }}>푸른 고래 · 연결됨</span></div>
        {PEERS.map((p) => (
          <div key={p.name} className="row">
            {p.state === "send" && <div className="fill" style={{ width: "62%" }} />}
            <div><div className="n">{p.name}</div><div className="meta">{p.state === "send" ? "2.6 GB / 4.2 GB · 38 MB/s · 남은 시간 약 1분" : p.os}</div></div>
            {p.state === "send" ? <div className="big">62%</div> : <div className="go" style={{ gridRow: "1/3" }}>보내기</div>}
          </div>
        ))}
        <p className="hint">기기를 누르거나 파일을 끌어다 놓으세요.</p>
      </div>
    </div>
  );
}

export function DirMock({ dir }: { dir: string }) {
  return (
    <>
      <style>{CSS}</style>
      {dir === "2" ? <Dir2 /> : dir === "3" ? <Dir3 /> : <Dir1 />}
    </>
  );
}
