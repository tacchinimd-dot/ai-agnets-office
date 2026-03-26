# TikTok Trending Hashtags Crawler

## 프로젝트 개요

TikTok Creative Center에서 **인기 상승 해시태그 Top 100**을 자동 크롤링하여 CSV/JSON으로 저장하는 크롤러.

- **소스:** https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en
- **수집 범위:** 글로벌 기준 1~100위 (7일 기간)
- **기술 스택:** Python + Playwright (headless Chromium)

## 프로젝트 구조

```
tiktok_hashtag_crawler/
├── tiktok_hashtag_crawler.py   # 메인 크롤러
├── output/                     # 크롤링 결과 저장
│   ├── tiktok_hashtags_latest.csv    # 최신 결과 (고정 이름)
│   ├── tiktok_hashtags_latest.json
│   └── tiktok_hashtags_YYYYMMDD_HHMMSS.csv/json  # 히스토리
└── STATUS.md                   # 이 파일
```

## 실행 방법

```bash
cd C:\Users\AD0903\tiktok_hashtag_crawler
python tiktok_hashtag_crawler.py
```

- 실행 시간: 약 30~40초
- 결과: `output/` 폴더에 타임스탬프 파일 + latest 파일 자동 저장

## 수집 항목

| 필드 | 설명 | 예시 |
|------|------|------|
| rank | 순위 | 1 |
| hashtag | 해시태그명 | sparemomentslive |
| hashtag_id | TikTok 내부 ID | 7576151729817944071 |
| posts | 게시물 수 | 74483 |
| video_views | 총 조회수 | 32911548 |
| rank_diff | 순위 변동폭 | 2 |
| rank_diff_type | 변동 유형 (1=상승, 2=신규, 3=하락, 4=유지) | 1 |
| is_promoted | 프로모션 여부 | False |
| trend_7d | 7일간 트렌드 곡선 (JSON) | [{time, value}, ...] |

## 핵심 동작 원리

1. **Playwright**로 headless Chromium 실행
2. **Route interception**으로 API의 `country_code=KR` → 빈값으로 변경 (한국 IP 제한 우회, 글로벌 데이터 수집)
3. `__NEXT_DATA__` (Next.js SSG)에서 초기 20개 추출
4. **"View More" 버튼** 반복 클릭 → API 응답 가로채기로 나머지 80개 수집
5. 중복 제거 후 100개 정규화하여 CSV/JSON 저장

## 의존성

- Python 3.10+
- playwright (`pip install playwright && playwright install chromium`)

## 작업 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-26 | 초기 크롤러 개발 완료 (100개 수집 성공) |

## 알려진 사항

- TikTok 페이지 구조(Next.js)가 변경되면 `__NEXT_DATA__` 파싱 로직 수정 필요
- API 엔드포인트: `creative_radar_api/v1/popular_trend/hashtag/list` (직접 호출 시 인증 필요, 브라우저 세션 경유 필수)
- 한국 IP에서는 자동으로 KR 데이터만 3개 표시 → Route interception으로 글로벌 전환
