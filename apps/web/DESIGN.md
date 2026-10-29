---
name: Radius
description: 같은 네트워크 기기끼리 파일을 주고받는 조용한 신호 화면.
colors:
  primary: "oklch(0.52 0.22 259)"
  primary-foreground: "oklch(0.99 0.005 255)"
  primary-dark: "oklch(0.72 0.15 254)"
  ink: "oklch(0.2 0.04 262)"
  paper: "oklch(1 0 0)"
  mist: "oklch(0.94 0.015 255)"
  mist-text: "oklch(0.5 0.035 258)"
  accent-wash: "oklch(0.95 0.035 252)"
  hairline: "oklch(0.915 0.015 255)"
  alert: "oklch(0.577 0.245 27.325)"
  night: "oklch(0.24 0.04 262)"
  night-card: "oklch(0.3 0.045 262)"
  status-online: "oklch(0.696 0.17 162.5)"
  status-wait: "oklch(0.828 0.165 84)"
typography:
  display:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "clamp(88px, 30vw, 128px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.06em"
  headline:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  control:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  control-lg:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  brand:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  unit:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
  progress:
    fontFamily: "Pretendard Variable, Geist Variable, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 800
    letterSpacing: "-0.05em"
rounded:
  pill: "9999px"
  card: "24px"
  dialog: "32px"
  chip: "16px"
spacing:
  gutter: "20px"
  row: "12px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 16px"
  button-connect:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 16px"
  button-accept:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "0 32px"
  dialog:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "28px"
---

# Design System: Radius

## Overview

**Creative North Star: "The Signal Field"**

한 화면이 곧 신호 공간이다. 근처 기기 수가 가장 큰 글자이고, 그 아래로 기기마다 고유한 파동이 가로지른다. 장식은 이 파동 하나뿐이고 나머지는 흰 바탕, 큰 글자, 둥근 알약 버튼으로 조용히 물러난다. 차분하고 기술적인 톤을 지키되 기술 용어는 화면에 내지 않는다.

밀도는 낮다. 한 손으로 쓰는 폰 한 열(최대 32rem)이 기본이고, 기기 카드는 2열 격자로 놓이다가 전송이 시작되면 2칸을 차지하며 그 자리에서 펼쳐진다. 색은 하나의 푸른 잉크가 주인이고, 기기 구분용 색상만 아바타와 파동에서 따로 쓴다.

**Key Characteristics:**
- 큰 숫자 하나가 첫인상 (근처 기기 수, 전송 중에는 진행률 %).
- 파동은 기기 id에서 결정되는 색·주기·속도. 전송 중인 기기는 진폭이 커진다.
- 그림자 없는 평면. 구분은 색 면과 링으로만.
- 모든 숫자는 tabular-nums.
- `prefers-reduced-motion`에서는 파동이 멈춘다.

## Colors

푸른 계열 단색 중심의 차가운 흰 바탕. 보라와 이모지 아이콘은 쓰지 않는다.

### Primary
- **Signal Blue** (oklch(0.52 0.22 259)): 파동 기본선, 진행률 숫자와 막대, 체크, 수락 버튼. 다크에서는 **Lifted Signal Blue** (oklch(0.72 0.15 254)).

### Neutral
- **Deep Ink** (oklch(0.2 0.04 262)): 본문과 주 버튼 배경(보내기).
- **Paper** (oklch(1 0 0)): 페이지·카드·다이얼로그 바탕. 다크는 **Night** (oklch(0.24 0.04 262)), 카드는 **Night Card** (oklch(0.3 0.045 262)).
- **Mist** (oklch(0.94 0.015 255)): 진행 막대 트랙, 비활성 면.
- **Mist Text** (oklch(0.5 0.035 258)): 보조 글자. 흰 바탕에서 4.5:1 이상.
- **Accent Wash** (oklch(0.95 0.035 252)): 연결 버튼 면, 파일 드롭 하이라이트.
- **Hairline** (oklch(0.915 0.015 255)): 경계선.

### Status
- **Online Green** (oklch(0.696 0.17 162.5)), **Wait Amber** (oklch(0.828 0.165 84)), 토큰 `--success`/`--warning`, **Alert Red** (oklch(0.577 0.245 27.325)): 상태 점과 오류 문구에만.

### Named Rules
**The One Ink Rule.** 화면에서 채워진 푸른 면은 수락 버튼과 진행 중인 숫자·막대뿐이다. 나머지 강조는 글자색이나 Accent Wash로 한다.

**The Peer Hue Rule.** 기기마다 고유 색조(hue)는 아바타와 파동에만 쓴다. 버튼, 글자, 상태에는 쓰지 않는다.

## Typography

**Display / Body Font:** Pretendard Variable (fallback Geist Variable, system-ui)

**Character:** 한글에 맞춘 중립 고딕. 큰 크기에서는 굵고 자간을 크게 조여 숫자를 조형처럼 쓰고, 본문은 읽기 편한 일반 두께.

### Hierarchy
- **Display** (800, clamp(88px, 30vw, 128px), 1, -0.06em): 근처 기기 수 숫자 하나.
- **Headline** (700, 28px, 1.25): 수락 다이얼로그 제목.
- **Title** (700, 24px): 내 기기 이름. 앱 이름 "Radius"는 22px bold.
- **Body** (400, 15px, 1.5): 안내 문장, 파일 이름 행.
- **Label** (600, 13px): 섹션 머리말("근처 기기", "내 기기"), 보조 상태 문구. 전송 중 진행률은 Progress(800, 56px)로 따로 키운다.
- **Control** (600, 14px): 카드 버튼과 상태 문구. **Control-lg** (600, 16px): 다이얼로그 버튼, 아바타 글자. **Brand** (700, 22px): 앱 이름. **Unit** (700, 32px): 숫자 옆 "대".

### Named Rules
**The Number Is The Headline Rule.** 상태는 문장보다 숫자로 먼저 읽힌다. 새 화면도 가장 중요한 값 하나를 가장 크게 둔다.

## Layout

한 열, 최대 폭 32rem(max-w-lg), 좌우 20px 여백, 위는 안전 영역을 반영한 2.5rem. 기기 목록은 2열 격자(가로 간격 8px, 세로 16px). 전송 중인 카드는 `col-span-2`로 펼쳐지고 진행 UI가 그 안에 들어간다. 섹션 사이는 40px. 폭이 넓어져도 열은 늘리지 않는다.

## Elevation & Depth

평면이다. 깊이는 색 면(Mist, Accent Wash)과 2px 링으로만 표현한다. 파일을 끌어다 놓을 때 카드에 푸른 링과 Accent Wash가 생긴다. 유일한 예외는 수락 다이얼로그로, 화면 위에 뜬 단 하나의 층이라 `shadow-xl`과 40% 검정 배경막을 쓴다.

### Named Rules
**The Flat-By-Default Rule.** 면은 그림자 없이 쉰다. 그림자는 모달 하나에만 허용한다.

## Shapes

둥글게 감싼다. 버튼과 아바타는 완전한 알약/원, 기기 카드는 24px, 다이얼로그는 32px, 다이얼로그 안의 오류 박스는 16px. 경계선은 거의 쓰지 않고 형태는 면의 색 차이로 드러난다. 진행 막대는 끝이 둥근 얇은 선(2~4px).

## Components

### Buttons
- **Shape:** 알약 (9999px), 높이 44px(카드), 48px(다이얼로그).
- **Primary (보내기):** Deep Ink 면에 Paper 글자. 다크에서는 반전. 결정적이고 부드럽다.
- **Connect (연결/다시 시도):** Accent Wash 면에 Signal Blue 글자.
- **Accept (받기):** Signal Blue 면, 높이 48px, 가로 32px.
- **Ghost (취소, 닫기, 저장):** 면 없음, 보조 글자색.
- **Focus:** 모든 요소에 2px Ring Blue 외곽선, 2px 간격.

### Device Card
아바타(44px 원, 이름 첫 글자, 기기별 색조, 명도 0.48로 흰 글자 4.5:1 확보) 위에 이름(18px 600), 그 아래 상태 점(6px)과 한 줄 상태 문구(13px). 오른쪽이나 아래에 알약 버튼 하나. 전송이 시작되면 가로로 눕고 아래로 TransferPanel이 펼쳐진다.

### Transfer Panel
진행 중에는 56px 800의 퍼센트 숫자와 4px 막대(`scaleX` 변환, 200ms linear). 파일이 여러 개면 행마다 2px 막대와 체크/점 아이콘이 붙고, 길면 "전체 보기"로 펼친다. 완료 시 체크와 총 용량, 필요하면 "저장" 고스트 버튼.

### Accept Dialog
Paper 바탕 32px 둥근 네이티브 `<dialog>`. 제목 28px, 보낸 기기 번호(지문 6자리)를 28px 800으로, 안내 한 줄과 총 용량을 13px로, 파일 목록은 15px 행 전체를 스크롤 상자(max-h-64)에 모두 보여 준다(동의 화면이라 이름을 숨기지 않는다). 취소(고스트)가 기본 포커스, 오른쪽에 받기(Signal Blue).

### Signature: Signal Wave
기기 수만큼 겹치는 사인파. 기본 파동 2줄(Signal Blue, 3px와 2px 35% 투명)과 기기별 파동(2px, 85% 투명, 색조 고유). 전송 중인 기기는 진폭 1.8배에 단계형 펄스. 오프라인이면 평평한 선. 높이 120px, 장식이므로 `aria-hidden`.

## Do's and Don'ts

### Do:
- **Do** 가장 중요한 값 하나를 Display 크기로 두고 나머지는 13~15px로 낮춘다.
- **Do** 숫자에는 항상 `tabular-nums`를 쓴다.
- **Do** 오류는 행동을 알려 주는 한 문장으로 쓴다("같은 Wi‑Fi에 연결돼 있는지 확인하고 다시 시도해 주세요").
- **Do** 본문 대비 4.5:1 이상을 지키고, 다크 모드에서 Primary를 밝은 값으로 바꾼다.
- **Do** 모션은 `prefers-reduced-motion`에서 끈다.

### Don't:
- **Don't** 카드, 목록, 버튼에 그림자를 넣지 않는다(다이얼로그만 예외).
- **Don't** 보라색, 그라데이션, 이모지 아이콘을 쓰지 않는다.
- **Don't** ICE, TURN, SCTP 같은 기술 용어를 화면에 낸다.
- **Don't** 기기 색조를 상태나 버튼의 색으로 쓴다.
- **Don't** 파동 말고 다른 장식 모션을 더하지 않는다.
