// marketing-tools.js — 정민호(Marketing Analyst)용 Claude tool_use 도구 정의
// KG API 기반 인플루언서 마케팅 성과 분석

const MARKETING_ANALYST_TOOLS = [
  {
    name: 'query_campaign_performance',
    description: `캠페인-상품별 인플루언서 마케팅 성과를 조회합니다.
캠페인수, 컨텐츠수, 인플루언서수, 좋아요, 댓글, 비디오조회수, 비용을 분석합니다.

주의: ST 브랜드 필터는 SYS_BRD_CD='8' (BRD_CD='ST'가 아님!)
SNS 채널: INSTA, YOUTUBE, NAVER_BLOG, TIKTOK
컨텐츠 유형: PHOTO, VIDEO`,
    input_schema: {
      type: 'object',
      properties: {
        selectors_campaign: {
          type: 'array',
          description: '캠페인 차원. 예: [{"system_field_name":"INFLUENCER_MARKETING_CAMPAIGN_NM"}]',
          items: { type: 'object', properties: { system_field_name: { type: 'string' } }, required: ['system_field_name'] }
        },
        selectors_influencer: {
          type: 'array',
          description: '인플루언서 차원. 예: [{"system_field_name":"SYS_BRD_CD"}]',
          items: { type: 'object', properties: { system_field_name: { type: 'string' } }, required: ['system_field_name'] }
        },
        selectors_product: {
          type: 'array',
          description: '상품 차원. 예: [{"system_field_name":"ITEM_GROUP"}]',
          items: { type: 'object', properties: { system_field_name: { type: 'string' } }, required: ['system_field_name'] }
        },
        filters: {
          type: 'array',
          description: '필터. ST 브랜드: [{"system_code":"8","system_field_name":"SYS_BRD_CD"}]',
          items: { type: 'object', properties: { system_code: { type: 'string' }, system_field_name: { type: 'string' } }, required: ['system_code','system_field_name'] }
        },
        start_dt: { type: 'string', description: '시작일 (YYYY-MM-DD)' },
        end_dt: { type: 'string', description: '종료일 (YYYY-MM-DD)' },
        purpose: { type: 'string', description: '조회 목적' }
      },
      required: ['filters', 'start_dt', 'end_dt', 'purpose']
    }
  },
  {
    name: 'query_content_performance',
    description: `컨텐츠별 인플루언서 마케팅 성과를 조회합니다.
개별 컨텐츠의 좋아요, 댓글, 비디오조회수, 비용을 분석합니다.
인플루언서별 팔로워수, SNS채널, 계정정보도 조회 가능합니다.

주의: ST 브랜드 필터는 SYS_BRD_CD='8'`,
    input_schema: {
      type: 'object',
      properties: {
        selectors_influencer: {
          type: 'array',
          description: '인플루언서 차원. 예: [{"system_field_name":"INFLUENCER_SNS_CHANNEL_ACCOUNT_ID"}]',
          items: { type: 'object', properties: { system_field_name: { type: 'string' } }, required: ['system_field_name'] }
        },
        selectors_campaign: {
          type: 'array',
          description: '캠페인 차원',
          items: { type: 'object', properties: { system_field_name: { type: 'string' } }, required: ['system_field_name'] }
        },
        selectors_content: {
          type: 'array',
          description: '컨텐츠 차원. 예: [{"system_field_name":"INFLUENCER_MARKETING_CONTENT_TYPE"}]',
          items: { type: 'object', properties: { system_field_name: { type: 'string' } }, required: ['system_field_name'] }
        },
        filters: {
          type: 'array',
          description: '필터. ST: [{"system_code":"8","system_field_name":"SYS_BRD_CD"}]',
          items: { type: 'object', properties: { system_code: { type: 'string' }, system_field_name: { type: 'string' } }, required: ['system_code','system_field_name'] }
        },
        start_dt: { type: 'string', description: '시작일' },
        end_dt: { type: 'string', description: '종료일' },
        purpose: { type: 'string', description: '조회 목적' }
      },
      required: ['filters', 'start_dt', 'end_dt', 'purpose']
    }
  }
];

module.exports = { MARKETING_ANALYST_TOOLS };
