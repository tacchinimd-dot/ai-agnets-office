# 무신사 랭킹 크롤러 프로젝트

## 개요
무신사 일간 랭킹 Top 100 상품 데이터를 API 기반으로 수집하고 HTML 대시보드로 시각화하는 크롤러

## 경로
- 프로젝트: `C:\Users\AD0903\musinsa_crawler\`
- 크롤러: `musinsa_ranking_crawler.py`
- 대시보드: `musinsa_ranking_dashboard.html`
- 데이터: `musinsa_ranking_data.json`

## 수집 데이터 (상품당)
| 필드 | 출처 |
|------|------|
| 순위 (rank) | 랭킹 API |
| 상품코드 (id) | 랭킹 API |
| 브랜드명 (brandName) | 랭킹 API |
| 상품명 (productName) | 랭킹 API |
| 판매가 (finalPrice) | 랭킹 API |
| 정가 (originalPrice) | 계산 |
| 할인율 (discountRatio) | 랭킹 API |
| 이미지 URL (imageUrl) | 랭킹 API |
| 급상승 여부 (isRising) | 랭킹 API labels |
| 카테고리 (category) | 상품명 키워드 분류 |
| 총 조회수 (pageViewTotal) | 상세 stat API |
| 누적판매량 (purchaseTotal) | 상세 stat API |
| 전환율 | 계산 (누적판매 / 총조회수) |

## 기술 구조
- **랭킹 수집**: `https://api.musinsa.com/api2/hm/web/v5/pans/ranking/sections/200` (requests, 인증 불필요)
- **누적판매량/조회수**: `https://goods-detail.musinsa.com/api2/goods/{id}/stat` (Playwright로 쿠키 추출 후 requests)
- **카테고리 분류**: 상품명 키워드 매핑 (긴 키워드 우선 매칭)
- **소요시간**: 약 20초 (랭킹 ~1초 + 누적판매량 ~19초)

## 카테고리 매핑 현황
- 아우터, 상의, 바지, 원피스/스커트, 신발, 가방, 모자, 액세서리, 속옷/잠옷, 뷰티, 식품/보충제
- 후드집업 → 상의로 분류
- 미분류 발생 시 대시보드에서 수동 편집 가능 (localStorage 저장)

## 대시보드 기능
- 검색 (브랜드/상품명)
- 카테고리 필터, 급상승/미분류 필터
- 카테고리 클릭 편집 (직접 입력 가능, localStorage에 저장)
- 전환율 색상 하이라이트 (5%+ 빨강, 3~5% 주황)
- CSV 내보내기
- 통계바 (카테고리 TOP3, 급상승 수, 미분류 수)

## 실행 방법
```bash
cd C:\Users\AD0903\musinsa_crawler
python musinsa_ranking_crawler.py
```

## 추후 진행 필요 사항
- [ ] 일간 자동 실행 (스케줄러/cron) — 매일 같은 시간 수집하여 추이 비교
- [ ] 누적판매량 변화 추적 — 일별 데이터 축적 시 주간 판매량 계산 가능
- [ ] 카테고리 키워드 지속 보강 — 신규 미분류 상품 발생 시 매핑 추가
- [ ] Snowflake 연동 — 수집 데이터를 FNF.PRCS 테이블에 적재
- [ ] 브랜드별/카테고리별 트렌드 분석 대시보드
- [ ] 랭킹 진입/이탈 상품 추적 (전일 대비 신규 진입, 순위 변동)

## 최종 업데이트
- 2026-03-24: 프로젝트 생성, Top 100 크롤러 완성
  - 랭킹 API + stat API 연동
  - 카테고리 키워드 분류 (미분류 0개 달성)
  - 누적판매량, 총 조회수, 전환율 수집
  - HTML 대시보드 (편집, 검색, 필터, CSV 내보내기)
