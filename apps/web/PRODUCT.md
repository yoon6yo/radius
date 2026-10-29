# PRODUCT

Source: SPEC.md + user answers. Platform: web (installable PWA, mobile web stays `web`). Mode: Operate (single app screen).

## Users and job
- 휴대폰·PC·태블릿 사이로 큰 파일을 자주 옮기는 개인 사용자. 한 손으로 폰을 쓰며 PC로 보내거나, 책상 위 두 기기를 번갈아 본다.
- Job: 근처 기기를 골라 파일을 보내고, 받는 쪽은 누가 보냈는지 확인한 뒤 수락·저장한다.

## Product
- 설치·가입 없이 같은 네트워크 기기끼리 P2P로 파일 전송. 서버는 연결 중개만 하고 파일을 거치지 않는다.
- 수십 GB도 연결이 끊기거나 새로고침해도 이어받는다. 재연결·재개·무결성 검증은 전부 자동.

## Constraints
- 한국어 전용 카피. 기술 용어(ICE, TURN, SCTP) 노출 금지. 오류는 행동 지시형 한 문장.
- 실행 파일도 경고 없이 전송(사용자 결정). 수락 다이얼로그의 보낸 기기 이름 + 기기 번호(지문 6자리)가 유일한 방어선.
- 송신 탭 새로고침 시 파일을 다시 골라야 함. 폴더는 파일별 저장.
- 범위 밖: 계정, TURN/클라우드, 다국어, zip, 영구 페어링, 텍스트 전송.

## Voice and brand
- 이름 Radius. 차분하고 기술적. 푸른 계열 단색 중심. 보라·이모지 아이콘·과장 마케팅 금지.

## Accessibility
- 본문 대비 4.5:1 이상, 키보드 조작 가능, 시스템 다크모드 대응.
