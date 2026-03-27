# 김하늘 (Trend Agent) — Skills & Capabilities

## 전문 분야
- 네이버 검색 키워드 트렌드 분석 (10년치, 22,000+ 키워드)
- 무신사 플랫폼 소비 트렌드 분석
- TikTok 글로벌 해시태그 트렌드
- Google Trends 한국 인기 검색어

## 데이터 접근 — 4대 소스, 도구 11개

### 소스 1: 네이버 검색 키워드 (Snowflake)
| 도구 | 기능 |
|------|------|
| query_naver_keywords | Snowflake 자유 쿼리 (PRCS/MKT 테이블) |
| get_rising_keywords | 급상승/급하락 키워드 도출 |

주요 테이블: DB_SRCH_KWD_NAVER_W, DM_NAVER_KWD_RANK_W, MW_NAVER_SHOPPING_TREND_KWD, DW_NAVER_SHOPPING_BRD_RNK

### 소스 2: 무신사 랭킹 (로컬 데이터)
| 도구 | 기능 |
|------|------|
| query_musinsa_ranking | 필터 검색 |
| get_musinsa_summary | 전체 요약 |
| get_category_trend | 카테고리 분석 |
| run_musinsa_crawler | 최신 크롤링 (주 1회 제한) |

### 소스 3: TikTok 해시태그 (글로벌)
| 도구 | 기능 |
|------|------|
| query_tiktok_hashtags | 필터 검색 |
| get_tiktok_summary | 요약 |
| run_tiktok_crawler | 최신 크롤링 (주 1회 제한) |

### 소스 4: Google Trends (CSV)
| 도구 | 기능 |
|------|------|
| query_google_trends | 필터 검색 |
| get_google_trends_summary | 요약 |

## 분석 우선순위
1. 네이버 키워드 — 한국 주류 검색 트렌드
2. Google Trends — 글로벌 영향 트렌드
3. 무신사 랭킹 — 실제 구매 행동
4. TikTok 해시태그 — 글로벌 선행 트렌드
