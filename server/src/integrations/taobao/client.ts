export type TaobaoConversionResult = {
  itemId: string;
  itemTitle: string;
  itemImageUrl: string;
  itemPriceCents: number;
  commissionRate: number;
  generatedPassword: string;
  generatedShortUrl: string;
  generatedClickUrl: string;
};

export interface TaobaoClient {
  convert(rawContent: string): Promise<TaobaoConversionResult>;
}

export class MockTaobaoClient implements TaobaoClient {
  async convert(_rawContent: string): Promise<TaobaoConversionResult> {
    return {
      itemId: "mock-item-100",
      itemTitle: "Mock Taobao Item",
      itemImageUrl: "https://img.alicdn.com/mock-item.png",
      itemPriceCents: 9900,
      commissionRate: 0.12,
      generatedPassword: "￥mockpassword￥",
      generatedShortUrl: "https://s.click.taobao.com/mock",
      generatedClickUrl: "https://uland.taobao.com/mock"
    };
  }
}
