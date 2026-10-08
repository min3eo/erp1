/** `+ 0` turns -0 into 0 so zero never prints as ₩-0. */
export const money = (n: number) => '₩' + (Number(n) + 0).toLocaleString('ko-KR');
