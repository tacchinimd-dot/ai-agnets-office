"""
무신사 랭킹 크롤러 - Top 100 상품 수집
API 기반으로 1~100위 상품 데이터를 수집하고 HTML 대시보드를 생성합니다.
"""

import requests
import json
import re
import os
import time
from datetime import datetime

# ─── 카테고리 키워드 매핑 ───
CATEGORY_MAP = {
    "아우터": [
        "자켓", "재킷", "점퍼", "집업", "코트", "패딩", "무스탕", "블루종",
        "바람막이", "윈드브레이커", "아노락", "카디건", "베스트", "조끼",
        "야상", "파카", "후리스", "플리스", "트렌치", "가디건", "짚업",
        "경량패딩", "숏패딩", "롱패딩", "다운", "바시티", "봄버",
        "jacket", "blouson", "wind jacket",
    ],
    "상의": [
        "티셔츠", "셔츠", "블라우스", "니트", "스웨터", "맨투맨", "후드티",
        "후디", "탑", "폴로", "저지", "크롭", "탱크탑", "반팔", "긴팔",
        "피케", "헨리넥", "래쉬가드", "져지", "스웨트셔츠", "크루넥",
        "롱슬리브", "슬리브리스", "t-shirt", "shirt", "후드집업",
    ],
    "바지": [
        "팬츠", "진", "데님", "슬랙스", "조거", "트레이닝", "쇼츠",
        "반바지", "숏팬츠", "와이드", "카고", "치노", "레깅스",
        "스웨트팬츠", "트러커", "배기",
        "jeans", "pants",
    ],
    "원피스/스커트": [
        "원피스", "드레스", "스커트", "치마",
        "skirt",
    ],
    "신발": [
        "스니커즈", "운동화", "구두", "로퍼", "슬리퍼", "샌들", "부츠",
        "뮬", "플랫", "힐", "러닝화", "슬립온", "데크슈즈", "워커",
        "쪼리", "스미스", "스페지알", "샥스", "코르세어",
        "NBPDGS", "NBRJGS", "누보", "모디세이", "킨치", "MOC",
    ],
    "식품/보충제": [
        "드링크", "맥스24g", "프로핏", "테이크핏",
    ],
    "가방": [
        "백팩", "가방", "토트백", "크로스백", "숄더백", "클러치", "에코백",
        "파우치", "더플백", "메신저백", "웨이스트백", "힙색", "백",
    ],
    "모자": [
        "캡", "모자", "버킷햇", "비니", "볼캡", "스냅백", "베레모",
    ],
    "액세서리": [
        "목걸이", "반지", "팔찌", "귀걸이", "시계", "벨트", "지갑",
        "머플러", "스카프", "넥타이", "양말", "장갑", "선글라스",
        "키링", "폰케이스", "안경",
    ],
    "속옷/잠옷": [
        "속옷", "팬티", "브라", "파자마", "잠옷", "런닝",
    ],
    "뷰티": [
        "향수", "퍼퓸", "립", "쿠션", "파운데이션", "세럼", "크림",
        "로션", "선크림", "마스크팩", "클렌징", "토너", "앰플",
    ],
}


def classify_product(product_name: str) -> str:
    """상품명에서 키워드를 분석하여 카테고리를 추정합니다. 긴 키워드 우선 매칭."""
    name_lower = product_name.lower()
    pairs = []
    for category, keywords in CATEGORY_MAP.items():
        for keyword in keywords:
            pairs.append((keyword.lower(), category))
    pairs.sort(key=lambda x: len(x[0]), reverse=True)
    for keyword, category in pairs:
        if keyword in name_lower:
            return category
    return "미분류"


def get_browser_cookies() -> str:
    """Playwright로 무신사 접속 후 쿠키를 추출합니다."""
    from playwright.sync_api import sync_playwright

    print("  브라우저 쿠키 추출 중...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(
            "https://www.musinsa.com/main/musinsa/ranking",
            wait_until="networkidle",
            timeout=30000,
        )
        cookies = page.context.cookies()
        ua = page.evaluate("navigator.userAgent")
        browser.close()

    cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
    return cookie_str, ua


def fetch_purchase_totals(products: list[dict]) -> list[dict]:
    """각 상품의 누적판매량을 수집합니다."""
    print(f"\n누적판매량 수집 시작... ({len(products)}개 상품)")
    cookie_str, ua = get_browser_cookies()

    headers = {
        "User-Agent": ua,
        "Accept": "application/json",
        "Referer": "https://www.musinsa.com/",
        "Origin": "https://www.musinsa.com",
        "Cookie": cookie_str,
    }

    success = 0
    for i, p in enumerate(products):
        url = f"https://goods-detail.musinsa.com/api2/goods/{p['id']}/stat"
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                p["purchaseTotal"] = data.get("purchaseTotal", 0)
                p["pageViewTotal"] = data.get("pageViewTotal", 0)
                success += 1
            else:
                p["purchaseTotal"] = None
                p["pageViewTotal"] = None
        except Exception:
            p["purchaseTotal"] = None
            p["pageViewTotal"] = None

        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{len(products)} 완료...")
            time.sleep(0.3)

    print(f"  누적판매량 수집 완료: {success}/{len(products)}개 성공")
    return products


def fetch_ranking_data(page: int = 1) -> dict:
    """무신사 랭킹 API를 호출합니다."""
    url = "https://api.musinsa.com/api2/hm/web/v5/pans/ranking/sections/200"
    params = {
        "storeCode": "musinsa",
        "categoryCode": "000",
        "ageBand": "AGE_BAND_ALL",
        "period": "DAILY",
        "gf": "A",
        "subPan": "product",
        "page": page,
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.musinsa.com/",
    }
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()


def extract_products(data: dict) -> list[dict]:
    """API 응답에서 상품 데이터를 추출합니다."""
    products = []
    modules = data.get("data", {}).get("modules", [])

    for module in modules:
        if module.get("type") != "MULTICOLUMN":
            continue

        items = module.get("items", [])
        for item in items:
            # 상품 컬럼인지 확인
            if item.get("type") != "PRODUCT_COLUMN":
                continue

            info = item.get("info", {})
            image = item.get("image", {})
            labels = image.get("labels", [])

            # 급상승 여부 확인
            is_rising = any(
                label.get("label") == "급상승" for label in labels
            )

            rank = image.get("rank")
            if rank is None:
                continue

            product = {
                "rank": rank,
                "id": item.get("id", ""),
                "brandName": info.get("brandName", ""),
                "productName": info.get("productName", ""),
                "finalPrice": info.get("finalPrice", 0),
                "originalPrice": 0,
                "discountRatio": info.get("discountRatio", 0),
                "imageUrl": image.get("url", ""),
                "additionalInfo": "",
                "isRising": is_rising,
            }

            # additionalInformation 추출
            add_info_list = info.get("additionalInformation", [])
            if add_info_list:
                product["additionalInfo"] = add_info_list[0].get("text", "")

            # originalPrice 계산
            if product["discountRatio"] and product["finalPrice"]:
                product["originalPrice"] = round(
                    product["finalPrice"] / (1 - product["discountRatio"] / 100)
                )

            # 카테고리 분류
            product["category"] = classify_product(product["productName"])

            products.append(product)

    return products


def crawl_top_100() -> list[dict]:
    """1~100위 상품을 수집합니다."""
    all_products = {}
    page = 1
    max_pages = 30  # 안전 장치

    print("무신사 랭킹 크롤링 시작...")

    while len(all_products) < 100 and page <= max_pages:
        print(f"  페이지 {page} 수집 중... (현재 {len(all_products)}개)")
        try:
            data = fetch_ranking_data(page=page)
            products = extract_products(data)

            if not products:
                print(f"  페이지 {page}: 데이터 없음. 종료.")
                break

            for p in products:
                rank = p["rank"]
                if rank <= 100 and rank not in all_products:
                    all_products[rank] = p

            page += 1

        except Exception as e:
            print(f"  에러 발생: {e}")
            break

    # 순위순 정렬
    result = [all_products[r] for r in sorted(all_products.keys())]
    print(f"수집 완료: 총 {len(result)}개 상품")
    return result


def generate_html(history: list[dict], output_path: str):
    """히스토리 데이터로 날짜별 탭 대시보드를 생성합니다.
    history: [{date: "2026-03-24", products: [...]}, ...]
    """
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    history_json = json.dumps(history, ensure_ascii=False, indent=2)

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>무신사 랭킹 Top 100 - {now}</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Segoe UI', -apple-system, sans-serif; background: #f5f5f5; color: #333; }}

.header {{
    background: #000; color: #fff; padding: 24px 32px;
    display: flex; justify-content: space-between; align-items: center;
    position: sticky; top: 0; z-index: 100;
}}
.header h1 {{ font-size: 22px; font-weight: 700; }}
.header h1 span {{ color: #ff4800; }}
.header-info {{ display: flex; gap: 16px; align-items: center; font-size: 13px; color: #aaa; }}
.header-info .badge {{
    background: #ff4800; color: #fff; padding: 4px 10px;
    border-radius: 12px; font-weight: 600; font-size: 12px;
}}

/* ── 날짜 탭 ── */
.date-tabs {{
    background: #111; padding: 0 32px; display: flex; gap: 0;
    overflow-x: auto; border-bottom: 2px solid #ff4800;
}}
.date-tab {{
    padding: 10px 20px; color: #888; font-size: 13px; font-weight: 600;
    cursor: pointer; border: none; background: none;
    border-bottom: 3px solid transparent; white-space: nowrap;
    transition: all .15s; font-family: inherit;
}}
.date-tab:hover {{ color: #ddd; }}
.date-tab.active {{ color: #fff; border-bottom-color: #ff4800; background: rgba(255,72,0,0.1); }}

.controls {{
    background: #fff; padding: 16px 32px; border-bottom: 1px solid #e0e0e0;
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
}}
.controls input, .controls select {{
    padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
    font-size: 13px; outline: none;
}}
.controls input:focus, .controls select:focus {{ border-color: #ff4800; }}
.controls input[type="text"] {{ width: 240px; }}
.controls button {{
    padding: 8px 16px; border: none; border-radius: 6px;
    font-size: 13px; cursor: pointer; font-weight: 600;
}}
.btn-export {{ background: #000; color: #fff; }}
.btn-export:hover {{ background: #333; }}
.btn-save {{ background: #ff4800; color: #fff; }}
.btn-save:hover {{ background: #e04000; }}
.btn-reset {{ background: #eee; color: #333; }}
.btn-reset:hover {{ background: #ddd; }}

.stats {{
    padding: 12px 32px; background: #fff; border-bottom: 1px solid #e0e0e0;
    display: flex; gap: 24px; font-size: 13px; color: #666;
}}
.stats .stat-item strong {{ color: #333; }}

.table-container {{
    padding: 16px 32px 60px; overflow-x: auto;
}}
table {{
    width: 100%; border-collapse: collapse; background: #fff;
    border-radius: 8px; overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}}
thead {{ background: #fafafa; }}
th {{
    padding: 12px 14px; text-align: left; font-size: 12px;
    font-weight: 600; color: #888; text-transform: uppercase;
    border-bottom: 2px solid #eee; white-space: nowrap;
}}
td {{
    padding: 10px 14px; border-bottom: 1px solid #f0f0f0;
    font-size: 13px; vertical-align: middle;
}}
tr:hover {{ background: #fafafa; }}

.rank-cell {{
    font-weight: 800; font-size: 16px; text-align: center; width: 50px;
}}
.rank-1 {{ color: #ff4800; }}
.rank-2 {{ color: #ff6b00; }}
.rank-3 {{ color: #ff9500; }}

.rising-badge {{
    display: inline-block; background: #fff3e0; color: #ff6d00;
    padding: 2px 8px; border-radius: 10px; font-size: 11px;
    font-weight: 700; margin-left: 6px;
}}

.product-cell {{
    display: flex; align-items: center; gap: 12px; min-width: 300px;
}}
.product-img {{
    width: 56px; height: 56px; border-radius: 6px;
    object-fit: cover; background: #f0f0f0; flex-shrink: 0;
}}
.product-info {{ display: flex; flex-direction: column; gap: 2px; }}
.product-brand {{ font-size: 11px; color: #888; font-weight: 600; }}
.product-name {{ font-size: 13px; font-weight: 500; line-height: 1.3; }}

.price-cell {{ white-space: nowrap; }}
.final-price {{ font-weight: 700; color: #000; }}
.original-price {{ font-size: 11px; color: #aaa; text-decoration: line-through; }}
.discount {{ color: #ff4800; font-weight: 700; font-size: 12px; margin-left: 4px; }}

.category-cell {{
    position: relative;
}}
.category-tag {{
    display: inline-block; padding: 4px 10px; border-radius: 12px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    border: 1px solid transparent; transition: all 0.2s;
}}
.category-tag:hover {{ border-color: #ff4800; }}
.category-tag.미분류 {{ background: #fff3e0; color: #e65100; border: 1px dashed #ffab40; }}
.category-tag.아우터 {{ background: #e3f2fd; color: #1565c0; }}
.category-tag.상의 {{ background: #e8f5e9; color: #2e7d32; }}
.category-tag.바지 {{ background: #f3e5f5; color: #6a1b9a; }}
.category-tag.신발 {{ background: #fce4ec; color: #c62828; }}
.category-tag.가방 {{ background: #fff8e1; color: #f57f17; }}
.category-tag.모자 {{ background: #e0f7fa; color: #00838f; }}
.category-tag.액세서리 {{ background: #f1f8e9; color: #558b2f; }}
.category-tag.원피스\\/스커트 {{ background: #fce4ec; color: #ad1457; }}
.category-tag.속옷\\/잠옷 {{ background: #efebe9; color: #4e342e; }}
.category-tag.뷰티 {{ background: #fce4ec; color: #d81b60; }}
.category-tag.식품\\/보충제 {{ background: #e8eaf6; color: #283593; }}

.category-edit {{
    display: none; position: absolute; top: 100%; left: 0; z-index: 50;
    background: #fff; border: 1px solid #ddd; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 6px;
    min-width: 140px;
}}
.category-edit.active {{ display: block; }}
.category-edit button {{
    display: block; width: 100%; text-align: left;
    padding: 6px 10px; border: none; background: none;
    font-size: 12px; cursor: pointer; border-radius: 4px;
}}
.category-edit button:hover {{ background: #f5f5f5; }}
.category-edit input {{
    width: 100%; padding: 6px 8px; border: 1px solid #ddd;
    border-radius: 4px; font-size: 12px; margin-top: 4px;
}}

.viewing {{ font-size: 11px; color: #999; }}

.footer {{
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #fff; border-top: 1px solid #e0e0e0;
    padding: 8px 32px; text-align: center; font-size: 11px; color: #aaa;
}}

.toast {{
    position: fixed; bottom: 60px; right: 32px;
    background: #333; color: #fff; padding: 12px 20px;
    border-radius: 8px; font-size: 13px; opacity: 0;
    transition: opacity 0.3s; z-index: 200;
}}
.toast.show {{ opacity: 1; }}
</style>
</head>
<body>

<div class="header">
    <h1><span>MUSINSA</span> 랭킹 Top 100</h1>
    <div class="header-info">
        <span id="dateInfo">수집일시: {now}</span>
        <span class="badge" id="totalCount">0개</span>
    </div>
</div>

<div class="date-tabs" id="dateTabs"></div>

<div class="controls">
    <input type="text" id="searchInput" placeholder="브랜드 / 상품명 검색...">
    <select id="categoryFilter">
        <option value="">전체 카테고리</option>
    </select>
    <select id="risingFilter">
        <option value="">전체</option>
        <option value="rising">급상승만</option>
        <option value="unclassified">미분류만</option>
    </select>
    <button class="btn-save" onclick="saveEdits()">편집 저장</button>
    <button class="btn-export" onclick="exportCSV()">CSV 내보내기</button>
    <button class="btn-reset" onclick="resetFilters()">필터 초기화</button>
</div>

<div class="stats" id="statsBar"></div>

<div class="table-container">
    <table>
        <thead>
            <tr>
                <th>순위</th>
                <th>상품</th>
                <th>카테고리</th>
                <th>판매가</th>
                <th>할인</th>
                <th>총 조회수</th>
                <th>누적판매</th>
                <th>전환율</th>
            </tr>
        </thead>
        <tbody id="tableBody"></tbody>
    </table>
</div>

<div class="footer">무신사 랭킹 크롤러 &middot; 데이터 수집일: {now}</div>
<div class="toast" id="toast"></div>

<script>
const HISTORY = {history_json};
let PRODUCTS = HISTORY.length ? HISTORY[0].products : [];
let currentDateIdx = 0;

const CATEGORIES = [
    "아우터","상의","바지","원피스/스커트","신발","가방","모자","액세서리","속옷/잠옷","뷰티","식품/보충제","미분류"
];

// 편집 내역 저장 (localStorage)
const STORAGE_KEY = "musinsa_ranking_edits";

function loadEdits() {{
    try {{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{{}}"); }}
    catch {{ return {{}}; }}
}}

function saveEditsToStorage(edits) {{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}}

// 편집 내역 적용
function applyEdits(products) {{
    const edits = loadEdits();
    products.forEach(p => {{
        const key = String(p.id);
        if (edits[key]) p.category = edits[key];
    }});
}}

applyEdits(PRODUCTS);

// 카테고리 필터 옵션 생성
function initCategoryFilter() {{
    const select = document.getElementById("categoryFilter");
    CATEGORIES.forEach(c => {{
        const opt = document.createElement("option");
        opt.value = c; opt.textContent = c;
        select.appendChild(opt);
    }});
}}

// 날짜 탭 초기화
function initDateTabs() {{
    const container = document.getElementById("dateTabs");
    HISTORY.forEach((entry, idx) => {{
        const btn = document.createElement("button");
        btn.className = "date-tab" + (idx === 0 ? " active" : "");
        btn.textContent = entry.date + (idx === 0 ? " (최신)" : "");
        btn.onclick = () => switchDate(idx);
        container.appendChild(btn);
    }});
}}

function switchDate(idx) {{
    currentDateIdx = idx;
    PRODUCTS = HISTORY[idx].products;
    applyEdits(PRODUCTS);
    // 탭 활성화
    document.querySelectorAll(".date-tab").forEach((t, i) => {{
        t.classList.toggle("active", i === idx);
    }});
    document.getElementById("dateInfo").textContent = "수집일: " + HISTORY[idx].date;
    renderTable();
}}

// 통계 바 업데이트
function updateStats(filtered) {{
    const catCount = {{}};
    let risingCount = 0;
    filtered.forEach(p => {{
        catCount[p.category] = (catCount[p.category] || 0) + 1;
        if (p.isRising) risingCount++;
    }});

    const parts = [
        `<span class="stat-item">표시: <strong>${{filtered.length}}개</strong></span>`,
        `<span class="stat-item">급상승: <strong>${{risingCount}}개</strong></span>`,
    ];

    const top3 = Object.entries(catCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c, n]) => `${{c}}(${{n}})`)
        .join(", ");
    parts.push(`<span class="stat-item">카테고리 TOP3: <strong>${{top3}}</strong></span>`);

    const unclassified = catCount["미분류"] || 0;
    if (unclassified > 0) {{
        parts.push(`<span class="stat-item" style="color:#e65100">미분류: <strong>${{unclassified}}개</strong></span>`);
    }}

    document.getElementById("statsBar").innerHTML = parts.join("");
}}

// 포맷
function formatPrice(n) {{ return n ? n.toLocaleString() + "원" : "-"; }}

function calcCvr(p) {{
    if (p.pageViewTotal == null || p.purchaseTotal == null || p.pageViewTotal === 0) return null;
    return (p.purchaseTotal / p.pageViewTotal) * 100;
}}

function getRankClass(rank) {{
    if (rank === 1) return "rank-1";
    if (rank === 2) return "rank-2";
    if (rank === 3) return "rank-3";
    return "";
}}

// 테이블 렌더
function renderTable() {{
    const search = document.getElementById("searchInput").value.toLowerCase();
    const catFilter = document.getElementById("categoryFilter").value;
    const risingFilter = document.getElementById("risingFilter").value;

    let filtered = PRODUCTS.filter(p => {{
        if (search && !(p.brandName.toLowerCase().includes(search) || p.productName.toLowerCase().includes(search))) return false;
        if (catFilter && p.category !== catFilter) return false;
        if (risingFilter === "rising" && !p.isRising) return false;
        if (risingFilter === "unclassified" && p.category !== "미분류") return false;
        return true;
    }});

    document.getElementById("totalCount").textContent = filtered.length + "개";
    updateStats(filtered);

    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td class="rank-cell ${{getRankClass(p.rank)}}">${{p.rank}}</td>
            <td>
                <div class="product-cell">
                    <img class="product-img" src="${{p.imageUrl}}" alt="" loading="lazy"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;56&quot; height=&quot;56&quot;><rect fill=&quot;%23eee&quot; width=&quot;56&quot; height=&quot;56&quot;/><text x=&quot;28&quot; y=&quot;32&quot; text-anchor=&quot;middle&quot; fill=&quot;%23aaa&quot; font-size=&quot;10&quot;>No IMG</text></svg>'">
                    <div class="product-info">
                        <span class="product-brand">${{p.brandName}}</span>
                        <span class="product-name">
                            ${{p.productName}}
                            ${{p.isRising ? '<span class="rising-badge">급상승 🔥</span>' : ''}}
                        </span>
                    </div>
                </div>
            </td>
            <td class="category-cell">
                <span class="category-tag ${{p.category}}" onclick="openCategoryEdit(this, '${{p.id}}')">${{p.category}}</span>
                <div class="category-edit" id="cat-edit-${{p.id}}">
                    ${{CATEGORIES.map(c => `<button onclick="setCategory('${{p.id}}','${{c}}',this)">${{c}}</button>`).join("")}}
                    <input type="text" placeholder="직접 입력..." onkeydown="if(event.key==='Enter')setCategory('${{p.id}}',this.value,this)">
                </div>
            </td>
            <td class="price-cell">
                <span class="final-price">${{formatPrice(p.finalPrice)}}</span>
                ${{p.discountRatio > 0 ? `<br><span class="original-price">${{formatPrice(p.originalPrice)}}</span>` : ''}}
            </td>
            <td>${{p.discountRatio > 0 ? `<span class="discount">${{p.discountRatio}}%</span>` : '-'}}</td>
            <td style="color:#555;">${{p.pageViewTotal != null ? p.pageViewTotal.toLocaleString() : '-'}}</td>
            <td style="font-weight:600; color:#1565c0;">${{p.purchaseTotal != null ? p.purchaseTotal.toLocaleString() + '건' : '-'}}</td>
            <td style="font-weight:700; color:${{(() => {{ const r = calcCvr(p); return r >= 5 ? '#c62828' : r >= 3 ? '#e65100' : '#333'; }})()}}">${{calcCvr(p) != null ? calcCvr(p).toFixed(1) + '%' : '-'}}</td>
        </tr>
    `).join("");
}}

// 카테고리 편집
let openEditId = null;

function openCategoryEdit(el, productId) {{
    // 이전 열린 것 닫기
    if (openEditId) {{
        const prev = document.getElementById("cat-edit-" + openEditId);
        if (prev) prev.classList.remove("active");
    }}
    const edit = document.getElementById("cat-edit-" + productId);
    edit.classList.toggle("active");
    openEditId = edit.classList.contains("active") ? productId : null;
}}

function setCategory(productId, category, el) {{
    if (!category.trim()) return;
    const product = PRODUCTS.find(p => String(p.id) === String(productId));
    if (product) {{
        product.category = category.trim();
        // localStorage에 저장
        const edits = loadEdits();
        edits[productId] = category.trim();
        saveEditsToStorage(edits);
        renderTable();
        showToast(`${{product.productName}} → ${{category.trim()}}`);
    }}
    openEditId = null;
}}

// 클릭 외부 시 닫기
document.addEventListener("click", (e) => {{
    if (!e.target.closest(".category-cell") && openEditId) {{
        const edit = document.getElementById("cat-edit-" + openEditId);
        if (edit) edit.classList.remove("active");
        openEditId = null;
    }}
}});

// 편집 저장 버튼
function saveEdits() {{
    showToast("편집 내역이 브라우저에 저장되었습니다");
}}

// CSV 내보내기
function exportCSV() {{
    const headers = ["순위","상품코드","브랜드","상품명","카테고리","판매가","정가","할인율","총조회수","누적판매","전환율","급상승","이미지URL"];
    const rows = PRODUCTS.map(p => [
        p.rank, p.id, p.brandName, `"${{p.productName.replace(/"/g,'""')}}"`,
        p.category, p.finalPrice, p.originalPrice, p.discountRatio + "%",
        p.pageViewTotal != null ? p.pageViewTotal : "",
        p.purchaseTotal != null ? p.purchaseTotal : "",
        calcCvr(p) != null ? calcCvr(p).toFixed(1) + "%" : "",
        p.isRising ? "Y" : "N", p.imageUrl
    ]);

    const bom = "\\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map(r => r.join(","))].join("\\n");
    const blob = new Blob([csv], {{ type: "text/csv;charset=utf-8;" }});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `musinsa_ranking_top100_{now.replace(" ", "_").replace(":", "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV 파일 다운로드 완료");
}}

// 필터 초기화
function resetFilters() {{
    document.getElementById("searchInput").value = "";
    document.getElementById("categoryFilter").value = "";
    document.getElementById("risingFilter").value = "";
    renderTable();
}}

// 토스트 알림
function showToast(msg) {{
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
}}

// 이벤트 바인딩
document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("categoryFilter").addEventListener("change", renderTable);
document.getElementById("risingFilter").addEventListener("change", renderTable);

// 초기화
initDateTabs();
initCategoryFilter();
applyEdits(PRODUCTS);
renderTable();
</script>
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"HTML 대시보드 생성: {output_path}")


def load_history(history_path: str) -> list[dict]:
    """히스토리 파일을 로드합니다. 없으면 빈 리스트 반환."""
    if os.path.exists(history_path):
        with open(history_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def migrate_legacy_data(output_dir: str, history: list[dict]) -> list[dict]:
    """기존 단일 musinsa_ranking_data.json을 히스토리 첫 엔트리로 마이그레이션합니다."""
    legacy_path = os.path.join(output_dir, "musinsa_ranking_data.json")
    if not os.path.exists(legacy_path):
        return history

    # 이미 히스토리에 데이터가 있으면 스킵
    if history:
        return history

    with open(legacy_path, "r", encoding="utf-8") as f:
        legacy_products = json.load(f)

    if legacy_products:
        # 파일 수정일을 날짜로 사용
        mtime = os.path.getmtime(legacy_path)
        date_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")
        history.append({"date": date_str, "products": legacy_products})
        print(f"  기존 데이터 마이그레이션: {date_str} ({len(legacy_products)}개)")

    return history


def main():
    output_dir = os.path.dirname(os.path.abspath(__file__))
    history_path = os.path.join(output_dir, "musinsa_ranking_history.json")

    # 1. 크롤링
    products = crawl_top_100()

    if not products:
        print("수집된 상품이 없습니다. API 응답을 확인해주세요.")
        return

    # 2. 누적판매량 수집
    products = fetch_purchase_totals(products)

    # 3. 히스토리 로드 + 기존 데이터 마이그레이션
    history = load_history(history_path)
    history = migrate_legacy_data(output_dir, history)

    # 4. 오늘 데이터 추가 (같은 날짜면 교체)
    today = datetime.now().strftime("%Y-%m-%d")
    history = [h for h in history if h["date"] != today]
    history.insert(0, {"date": today, "products": products})

    # 최신순 정렬 (최신이 앞)
    history.sort(key=lambda h: h["date"], reverse=True)

    # 5. 히스토리 저장
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f"히스토리 저장: {history_path} ({len(history)}개 날짜)")

    # 6. 최신 데이터를 단일 JSON으로도 저장 (하위 호환)
    json_path = os.path.join(output_dir, "musinsa_ranking_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    print(f"최신 JSON 저장: {json_path}")

    # 7. HTML 대시보드 생성 (전체 히스토리 포함)
    html_path = os.path.join(output_dir, "musinsa_ranking_dashboard.html")
    generate_html(history, html_path)

    # 8. 요약
    categories = {}
    rising_count = 0
    unclassified = 0
    for p in products:
        categories[p["category"]] = categories.get(p["category"], 0) + 1
        if p["isRising"]:
            rising_count += 1
        if p["category"] == "미분류":
            unclassified += 1

    print(f"\n{'='*50}")
    print(f"수집 요약 ({today})")
    print(f"{'='*50}")
    print(f"  총 상품: {len(products)}개")
    print(f"  급상승: {rising_count}개")
    print(f"  미분류: {unclassified}개")
    print(f"  히스토리: {len(history)}개 날짜")
    print(f"\n  카테고리별:")
    for cat, cnt in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"    {cat}: {cnt}개")


if __name__ == "__main__":
    main()
