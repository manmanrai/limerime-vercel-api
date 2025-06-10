import handler from '../pages/api/update-mzdao';
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

const mockFetch = (metafields = [], ok = true, metafieldRes = { metafield: { id: '999', value: 'test' } }) => {
  global.fetch = jest.fn()
    // 取得 customer 的所有 metafields
    .mockResolvedValueOnce({
      json: async () => ({ metafields }),
      ok: true,
    } as unknown as Response)
    // 新增或更新 metafield
    .mockResolvedValueOnce({
      json: async () => metafieldRes,
      ok,
    } as unknown as Response);
};

describe('update-mzdao API', () => {
  it('should return 405 if not POST', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('should return 400 if missing fields', async () => {
    const { req, res } = createMocks({ method: 'POST', body: {} });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it('should create metafield if not exists', async () => {
    mockFetch([]);
    const { req, res } = createMocks({
      method: 'POST',
      body: { customerId: '123', value: 'test' },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.metafield.value).toBe('test');
  });

  it('should update metafield if exists', async () => {
    mockFetch([{ id: '888', namespace: 'custom', key: 'mzdao' }], true, { metafield: { id: '888', value: 'updated' } });
    const { req, res } = createMocks({
      method: 'POST',
      body: { customerId: '123', value: 'updated' },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.metafield.id).toBe('888');
    expect(data.metafield.value).toBe('updated');
  });

  it('should return 500 if shopify error', async () => {
    mockFetch([], false, { errors: 'error' });
    const { req, res } = createMocks({
      method: 'POST',
      body: { customerId: '123', value: 'fail' },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('error');
  });
}); 