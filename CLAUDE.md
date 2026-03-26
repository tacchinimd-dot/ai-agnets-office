# AI Agents Office — Claude Code 지침

## 프로젝트 경로

`C:\Users\AD0903\ai_office_project\`

## 핵심 규칙

- 메인 파일: `ai_agents_office.html` (HTML+CSS+JS 단일 파일, 외부 의존성 없음)
- 현황 파일: `PROJECT_STATUS.md` — 작업 완료 시 반드시 업데이트
- 작업 전 `/office` 커맨드로 현황 파악 후 진행
- 한국어로 응답

## 기술 스택

- HTML5 Canvas 2D (라이브러리 없음)
- 캔버스 해상도: 1600x900
- 오프스크린 캔버스로 나무 배경 pre-rendering (Seeded RNG, seed=42)
- requestAnimationFrame 기반 60fps 게임 루프

## 에이전트 구조

- `AGENT_CFG`: 5명의 외형/위치 설정
- `AGENT_INFO`: 한국어 역할/업무 정보 (툴팁용)
- `Agent` 클래스: state machine (idle / visit / hosting / meeting / returning)
- 이동은 회의실 방문 시에만 발생 (의미없는 산책 없음)

## 렌더링 규칙

- 워크스테이션 렌더링 순서: 모니터(배경) → 책상 → 캐릭터(전면) → 의자(최전면)
- 캐릭터는 모니터를 향해 앉아있어 뒷모습(showBack=true)이 보임
- 자리 비움 시: 빈 의자 + [부재중] 빨간 뱃지 + 모니터 꺼짐
- 걸어다니는 에이전트는 Y-sorting으로 깊이 처리

## 작업 완료 시 체크리스트

1. `ai_agents_office.html` 브라우저 테스트 가능 상태 확인
2. `PROJECT_STATUS.md` 변경 이력 업데이트
3. 새 기능 추가 시 구현 완료 / 미구현 목록 갱신

## 향후 계획

- Claude API 연동 (Haiku 4.5 추천, 비용 효율)
- Node.js 백엔드 추가 시 폴더 구조 재설계 필요
- 사용자가 데이터를 제공하면 각 에이전트에 연결
