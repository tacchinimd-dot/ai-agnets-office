"""
TikTok Trending Hashtags Crawler (Playwright)
- TikTok Creative Center에서 인기 해시태그 1~100위를 크롤링
- Route interception으로 country_code 제한 우회
- "View More" 버튼 반복 클릭으로 전체 100개 수집
- CSV + JSON으로 저장
"""

import json
import csv
import sys
import os
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from playwright.sync_api import sync_playwright

# Windows 콘솔 UTF-8 출력
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TARGET_URL = "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en"
OUTPUT_DIR = Path(__file__).parent / "output"


def modify_hashtag_api_url(url: str) -> str:
    """API URL에서 country_code를 제거하고 limit을 20으로 설정"""
    parsed = urlparse(url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params["country_code"] = [""]  # 글로벌
    if "limit" in params:
        params["limit"] = ["20"]
    new_query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse(parsed._replace(query=new_query))


def extract_next_data(page) -> list[dict]:
    """__NEXT_DATA__에서 해시태그 추출"""
    try:
        script = page.query_selector("script#__NEXT_DATA__")
        if not script:
            return []
        data = json.loads(script.inner_text())
        queries = data["props"]["pageProps"]["dehydratedState"]["queries"]
        for q in queries:
            qdata = q.get("state", {}).get("data", {})
            if isinstance(qdata, dict) and "pages" in qdata:
                items = []
                for pg in qdata["pages"]:
                    if isinstance(pg, dict) and "list" in pg:
                        items.extend(pg["list"])
                if items:
                    return items
    except Exception as e:
        print(f"  [WARN] __NEXT_DATA__ error: {e}")
    return []


def normalize(item: dict, rank: int) -> dict:
    """데이터 정규화"""
    trend = item.get("trend", [])
    return {
        "rank": rank,
        "hashtag": item.get("hashtagName", item.get("hashtag_name", "")),
        "hashtag_id": item.get("hashtagId", item.get("hashtag_id", "")),
        "posts": item.get("publishCnt", item.get("publish_cnt", 0)),
        "video_views": item.get("videoViews", item.get("video_views", 0)),
        "rank_diff": item.get("rankDiff", item.get("rank_diff", 0)),
        "rank_diff_type": item.get("rankDiffType", item.get("rank_diff_type", "")),
        "is_promoted": item.get("isPromoted", item.get("is_promoted", False)),
        "trend_7d": json.dumps(trend) if trend else "",
    }


def save_csv(data, filepath):
    if not data:
        return
    with open(filepath, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(data[0].keys()))
        w.writeheader()
        w.writerows(data)
    print(f"  CSV: {filepath}")


def save_json(data, filepath):
    out = {
        "crawled_at": datetime.now().isoformat(),
        "source": "TikTok Creative Center - Trending Hashtags",
        "url": TARGET_URL,
        "period": "7 days",
        "total_count": len(data),
        "hashtags": data,
    }
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"  JSON: {filepath}")


def fmt(n):
    if not isinstance(n, (int, float)):
        return str(n)
    if n >= 1e9: return f"{n/1e9:.1f}B"
    if n >= 1e6: return f"{n/1e6:.1f}M"
    if n >= 1e3: return f"{n/1e3:.1f}K"
    return str(n)


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    print("=" * 60)
    print("TikTok Trending Hashtags Crawler")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    all_raw = []
    api_collected = []

    with sync_playwright() as p:
        print("\n[1/3] Launching browser...")
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
        )
        page = ctx.new_page()

        # Route interception: hashtag/list API의 country_code를 빈값으로 변경
        def handle_route(route):
            url = route.request.url
            if "hashtag/list" in url and "country_code=" in url:
                new_url = modify_hashtag_api_url(url)
                print(f"  [Route] Redirecting API: country_code -> global")
                route.continue_(url=new_url)
            else:
                route.continue_()

        page.route("**/creative_radar_api/**", handle_route)

        # API 응답 수집
        def on_response(resp):
            if "hashtag/list" in resp.url:
                try:
                    body = resp.json()
                    if body.get("code") == 0:
                        items = body.get("data", {}).get("list", [])
                        if items:
                            api_collected.extend(items)
                            print(f"  [API] Got {len(items)} hashtags (total intercepted: {len(api_collected)})")
                except:
                    pass

        page.on("response", on_response)

        print("\n[2/3] Loading page & collecting data...")
        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(3000)

        # __NEXT_DATA__ 추출
        next_items = extract_next_data(page)
        if next_items:
            print(f"  __NEXT_DATA__: {len(next_items)} hashtags")
            all_raw.extend(next_items)

        # "Got it" 모달 닫기
        got_it = page.query_selector("button:has-text('Got it')")
        if got_it and got_it.is_visible():
            got_it.click()
            page.wait_for_timeout(500)
            print("  Dismissed 'Got it' modal")

        # "View More" 버튼 반복 클릭으로 추가 데이터 로드
        # API에서 중복이 있으므로 넉넉하게 수집
        for attempt in range(10):
            if len(api_collected) >= 100:
                break

            view_more = page.query_selector("[class*='ViewMoreBtn'], [class*='viewMore']")
            if not view_more:
                view_more = page.query_selector("text=View More")
            if not view_more:
                view_more = page.query_selector("text=View more")

            if view_more and view_more.is_visible():
                prev_count = len(api_collected)
                print(f"  Clicking 'View More' (attempt {attempt + 1})...")
                view_more.scroll_into_view_if_needed()
                view_more.click()
                page.wait_for_timeout(3000)

                # 새 데이터가 로드되었는지 확인
                if len(api_collected) == prev_count:
                    # 스크롤 후 다시 시도
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    page.wait_for_timeout(2000)
            else:
                # View More가 없으면 스크롤 후 재시도
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(3000)

                view_more = page.query_selector("[class*='ViewMoreBtn'], [class*='viewMore']")
                if not view_more:
                    view_more = page.query_selector("text=View More")
                if not view_more:
                    view_more = page.query_selector("text=View more")
                if view_more and view_more.is_visible():
                    continue  # 다시 클릭 시도
                else:
                    print("  No more 'View More' button found")
                    break

        # API에서 수집된 데이터 병합
        if api_collected:
            print(f"  API intercepted total: {len(api_collected)} hashtags")
            all_raw.extend(api_collected)

        browser.close()

    # 중복 제거 & 정규화
    seen = set()
    hashtags = []
    rank = 1
    for item in all_raw:
        name = item.get("hashtagName", item.get("hashtag_name", "")).lower()
        if name and name not in seen:
            seen.add(name)
            hashtags.append(normalize(item, rank))
            rank += 1
            if rank > 100:
                break

    print(f"\n  Final: {len(hashtags)} unique hashtags")

    if not hashtags:
        print("\n[ERROR] No data collected.")
        sys.exit(1)

    # 저장
    print(f"\n[3/3] Saving...")
    save_csv(hashtags, OUTPUT_DIR / f"tiktok_hashtags_{ts}.csv")
    save_json(hashtags, OUTPUT_DIR / f"tiktok_hashtags_{ts}.json")
    save_csv(hashtags, OUTPUT_DIR / "tiktok_hashtags_latest.csv")
    save_json(hashtags, OUTPUT_DIR / "tiktok_hashtags_latest.json")

    # Preview
    print(f"\n{'Rank':<6}{'Hashtag':<30}{'Posts':<10}{'Views':<12}{'Diff'}")
    print("-" * 66)
    for h in hashtags[:20]:
        diff = h.get("rank_diff", 0)
        diff_str = f"+{diff}" if isinstance(diff, int) and diff > 0 else str(diff) if diff else "new"
        print(f"{h['rank']:<6}#{h['hashtag']:<29}{fmt(h['posts']):<10}{fmt(h['video_views']):<12}{diff_str}")
    if len(hashtags) > 20:
        print(f"  ... and {len(hashtags) - 20} more")

    print(f"\nDone! {len(hashtags)} hashtags -> {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
