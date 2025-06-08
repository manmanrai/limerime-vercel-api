import handler from '../pages/api/update-metafield';
import { createMocks } from 'node-mocks-http';

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV };
  process.env.SHOPIFY_SHOP_DOMAIN = 'test-shop.myshopify.com';
  process.env.SHOPIFY_ADMIN_API_TOKEN = 'test-token';
});

afterAll(() => {
  process.env = OLD_ENV;
});

const mockFetch = (tags: string[] = []) => {
  global.fetch = jest.fn()
    // 取得 customer
    .mockResolvedValueOnce({
      json: async () => ({
        customer: { tags: tags.join(',') }
      }),
      ok: true,
    } as unknown as Response)
    // 更新 customer tags
    .mockResolvedValueOnce({
      json: async () => ({}),
      ok: true,
    } as unknown as Response)
    // 取得 metafields
    .mockResolvedValueOnce({
      json: async () => ({ metafields: [] }),
      ok: true,
    } as unknown as Response)
    // 更新 metafield
    .mockResolvedValue({
      json: async () => ({}),
      ok: true,
    } as unknown as Response);
};

function getBirthDate(yearsAgo: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsAgo);
  // 減一天避免生日還沒到
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

describe('update-metafield API', () => {
  it('29歲應該有 under30 tag', async () => {
    mockFetch();
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        customerId: '123',
        self_birth_date: getBirthDate(29),
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toContain('under30');
    expect(data.tags).not.toContain('above30');
  });

  it('30歲應該有 under30 tag', async () => {
    mockFetch();
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        customerId: '123',
        self_birth_date: getBirthDate(30),
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toContain('under30');
    expect(data.tags).not.toContain('above30');
  });

  it('31歲應該有 above30 tag', async () => {
    mockFetch();
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        customerId: '123',
        self_birth_date: getBirthDate(31),
      },
    });
    await handler(req, res);
    const data = JSON.parse(res._getData());
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toContain('above30');
    expect(data.tags).not.toContain('under30');
  });

  it('剛滿 30 歲（生日已過）應該有 under30 tag', async () => {
    // 這個測試確保剛滿 30 歲（生日已過，實際年齡已滿 30 歲）依然算 under30
    mockFetch();
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        customerId: '123',
        self_birth_date: getBirthDate(30), // 生日已過，剛滿 30 歲
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toContain('under30');
    expect(data.tags).not.toContain('above30');
  });

  it('1995/4/2（未滿 30 歲）應該有 under30 tag', async () => {
    // 今天是 4/1，1995/4/2 還沒滿 30 歲
    mockFetch();
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        customerId: '123',
        self_birth_date: '1995-04-02',
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toContain('under30');
    expect(data.tags).not.toContain('above30');
  });

  it('1995/4/1（剛滿 30 歲）應該有 above30 tag', async () => {
    // 今天是 4/1，1995/4/1 剛好滿 30 歲
    mockFetch();
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        customerId: '123',
        self_birth_date: '1995-04-01',
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags).toContain('above30');
    expect(data.tags).not.toContain('under30');
  });
}); 