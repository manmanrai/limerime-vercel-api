import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
  const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;

  // 從 query string 取得 customerId
  const { customerId } = req.query;
  if (!customerId) {
    return res.status(400).json({ error: '缺少 customerId 參數' });
  }

  // 轉成數字型態（可根據需求調整）
  const customerIdNum = Array.isArray(customerId) ? customerId[0] : customerId;

  // 取得 customer 的所有 metafields
  const metafieldsRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerIdNum}/metafields.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const metafieldsData = await metafieldsRes.json();
  const value = metafieldsData.metafields.filter((metafield: { namespace: string; key: string }) => metafield.namespace === 'over-30');
  const valueJson = JSON.parse(value[0].value);
  res.status(200).json(valueJson);
} 