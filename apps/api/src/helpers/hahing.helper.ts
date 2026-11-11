import argon2 from "argon2";

export class HashingHelper {
  static async hash({ value }: { value: string }) {
    return await argon2.hash(value);
  }

  static async verify({
    hashedValue,
    originalValue,
  }: {
    originalValue: string;
    hashedValue: string;
  }) {
    return await argon2.verify(hashedValue, originalValue);
  }
}
