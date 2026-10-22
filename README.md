# Radius

설치도 가입도 없이, 가까운 기기끼리 파일을 직접 주고받는 P2P 전송 웹앱. 수십 GB도 연결이 끊기거나 새로고침해도 이어받습니다.

- 같은 네트워크의 기기를 자동으로 찾아 WebRTC로 직접 연결합니다. 서버는 연결 중개만 하고 파일은 거치지 않습니다.
- 받는 쪽은 보낸 기기 이름과 기기 ID 지문을 확인한 뒤 수락합니다.
- 재연결, 이어받기, 무결성 검증은 자동입니다. 받은 데이터는 OPFS에 쌓고 폴더는 파일별로 저장합니다.
- 계정, TURN, 영구 페어링은 지원하지 않습니다.

## 구조

| 경로 | 역할 |
|---|---|
| `apps/web` | React + Vite PWA (Cloudflare Workers 정적 에셋으로 배포) |
| `apps/signal-worker` | 시그널링용 Cloudflare Worker, Durable Object 1개가 모든 방을 담당 |
| `apps/signal` | 같은 시그널링 서버의 Node 구현 |
| `packages/engine` | 전송 엔진: 블록 분할, 재개, 송수신 상태 머신, RTC 연결 |
| `packages/protocol` | 송수신 메시지 정의와 검증 |

## 개발

요구 사항: Node 22 이상, pnpm.

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @radius/signal-worker dev     # ws://localhost:8787/ws
VITE_SIGNAL_URL=ws://localhost:8787/ws pnpm --filter @radius/web dev
```

배포 절차는 `apps/signal-worker/README.md`를 참고하세요. 알려진 이슈와 의도된 트레이드오프는 `BUGS.md`에 있습니다.
