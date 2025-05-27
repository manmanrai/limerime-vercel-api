import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
  const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const namespace = 'over-30';
  const valueType = 'json';
  const key = 'over-30-key';
  const { customerId, value } = req.body;

  if (!customerId || !namespace || !key || !value || !valueType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 解析 value 內所有 birth 結尾的欄位，檢查是否有小於 30 歲
  function isUnder30(birth: string) {
    if (!birth) return false;
    const birthDate = new Date(birth);
    if (isNaN(birthDate.getTime())) return false;
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      return age - 1 < 30;
    }
    return age < 30;
  }

  let hasUnder30 = false;
  try {
    const valueObj = typeof value === 'string' ? JSON.parse(value) : value;
    for (const key in valueObj) {
      if (key.endsWith('birth') || key.endsWith('birth_date')) {
        if (isUnder30(valueObj[key])) {
          hasUnder30 = true;
          break;
        }
      }
    }
  } catch {
    return res.status(400).json({ error: 'Invalid value format' });
  }

  // 取得 customer 目前的 tags
  const customerRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const customerData = await customerRes.json();
  let tags = customerData.customer?.tags ? customerData.customer.tags.split(',').map((t: string) => t.trim()) : [];

  // 根據 hasUnder30 新增或移除 under30 tag
  if (hasUnder30) {
    if (!tags.includes('under30')) tags.push('under30');
  } else {
    tags = tags.filter((t: string) => t !== 'under30');
  }

  // 更新 customer tags
  await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}.json`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ customer: { id: customerId, tags: tags.join(', ') } }),
  });

  const metafieldPayload = {
    metafield: {
      namespace,
      key,  
      value,
      type: valueType,
    },
  };

  let url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`;
  let method = 'POST';

  // 取得 customer 的所有 metafields
  const metafieldsRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const metafieldsData = await metafieldsRes.json();
  const existingMetafield = metafieldsData.metafields.find(
    (metafield: { namespace: string; key: string; id: string }) => metafield.namespace === namespace && metafield.key === key
  );
  const metafieldId = existingMetafield?.id;

  // 如果有 metafieldId，則改為更新
  if (metafieldId) {
    url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/metafields/${metafieldId}.json`;
    method = 'PUT';
  }

  const shopifyRes = await fetch(url, {
    method,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metafieldPayload),
  });

  const data = await shopifyRes.json();

  if (!shopifyRes.ok) {
    return res.status(shopifyRes.status).json({ error: data.errors || data });
  }

  res.status(200).json({ tags });
} 