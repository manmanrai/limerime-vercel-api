import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
  const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
  const namespace = 'custom';
  const keys = [
    'self_birth_date',
    'under30_a',
    'under30_a_relationship',
    'under30_a_birth',
    'under30_b',
    'under30_b_relationship',
    'under30_b_birth',
    'under30_c',
    'under30_c_relationship',
    'under30_c_birth',
    'under30_d',
    'under30_d_relationship',
    'under30_d_birth',
  ];
  const valueTypes = {
    'age': "number_integer",
    'under30_a': 'single_line_text_field', 
    'under30_a_relationship': 'list.single_line_text_field',
    'under30_a_birth': 'date',
    'under30_b': 'single_line_text_field', 
    'under30_b_relationship': 'list.single_line_text_field',
    'under30_b_birth': 'date',
    'under30_c': 'single_line_text_field', 
    'under30_c_relationship': 'list.single_line_text_field',
    'under30_c_birth': 'date',
    'under30_d': 'single_line_text_field', 
    'under30_d_relationship': 'list.single_line_text_field',
    'under30_d_birth': 'date',
  };
  const { customerId } = req.body;

  if (!customerId || !namespace) {
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

  // 只取出 keys 中存在於 req.body 的欄位
  const valueObj: Record<string, string> = {};
  for (const key of keys) {
    if (req.body[key] !== undefined) {
      valueObj[key] = req.body[key];
    }
  }

  // 檢查是否有小於 30 歲
  let hasUnder30 = false;
  for (const key in valueObj) {
    if (key.endsWith('birth') || key.endsWith('birth_date')) {
      if (isUnder30(valueObj[key])) {
        hasUnder30 = true;
        break;
      }
    }
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

  // 取得 customer 的所有 metafields
  const metafieldsRes = await fetch(`https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN as string,
      'Content-Type': 'application/json',
    },
  });
  const metafieldsData = await metafieldsRes.json();
  const allMetafields = metafieldsData.metafields || [];

  // 並行更新所有存在的欄位到 metafield
  await Promise.all(
    Object.keys(valueObj).map(async (key) => {
      let metafieldKey = key;
      let valueType = (valueTypes as Record<string, string>)[key] || 'single_line_text_field';
      let metafieldValue: string = valueObj[key];
      // 特殊處理 self_birth_date
      if (key === 'self_birth_date') {
        metafieldKey = 'age';
        valueType = 'number_integer';
        // 計算年齡
        const birthDate = new Date(metafieldValue);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        metafieldValue = age.toString();
      }
      if (key.endsWith('_relationship')) {
        // 若值為空字串，存成空陣列
        if (!metafieldValue) {
          metafieldValue = JSON.stringify([]);
        } else {
          metafieldValue = JSON.stringify([metafieldValue]);
        }
      }
      const existingMetafield = allMetafields.find(
        (metafield: { namespace: string; key: string; id: string }) => metafield.namespace === namespace && metafield.key === metafieldKey
      );
      const metafieldId = existingMetafield?.id;
      let url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/customers/${customerId}/metafields.json`;
      let method = 'POST';
      if (metafieldId) {
        url = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2025-04/metafields/${metafieldId}.json`;
        method = 'PUT';
      }
      const metafieldPayload = {
        metafield: {
          namespace,
          key: metafieldKey,
          value: metafieldValue,
          type: valueType,
        },
      };
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
        throw new Error(JSON.stringify(data.errors || data));
      }
    })
  );

  res.status(200).json({ tags });
} 