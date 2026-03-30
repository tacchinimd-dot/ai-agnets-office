# 박도현 (Product Planning) — Skills & Capabilities

## 전문 분야
- 카테고리 전략 수립 (판매+재고 데이터 기반)
- SKU 기획 및 구성 (소재/핏/색상/사이즈)
- 원가 구조 분석 및 마진 최적화

## 데이터 접근 — 지식그래프 API (상품/원가/카테고리/랭킹/재고/유사상품), 도구 6개

| 도구 | 기능 |
|------|------|
| query_product_info | 상품 마스터 검색 (품번/시즌/카테고리/성별 필터) |
| query_product_cost | PO별 원가 조회 (마크업, 공장원가, 환율) |
| get_category_performance | 시즌 카테고리별 발입출판재 (당해 vs 전년 비교) |
| get_top_selling_styles | 기간 내 판매 TOP 스타일 랭킹 |
| get_similar_styles | 특정 품번의 전년 유사상품 조회 (ML 기반) |
| get_product_stock_info | 상품 재고 현황 (물류/매장/전체) |

> 2026-03-30: Snowflake 직접 접속 → 지식그래프 API 전환 (dcs-ai-cli 경유)

## 필터 공통 규칙
- 브랜드: { system_code: "ST", system_field_name: "BRD_CD" }
- 시즌: { system_code: "26S", system_field_name: "SESN" }
- 카테고리: { system_code: "다운", system_field_name: "ITEM_GROUP" }

## 기획 분석 가이드
- 판매금액 + 재고수량 함께 확인 (재고회전율)
- 잘 팔리는 스타일의 소재/핏/기장 공통점 도출
- 원가 분석 시 마크업(TAG가/원가) 3배 이상이면 마진 양호. VAT 제외이므로 ×1.1 필요
- 유사상품 조회로 전년 히트 스타일의 후속 기획 검토
