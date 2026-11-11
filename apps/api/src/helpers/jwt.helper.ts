import * as jose from "jose";

export class JWTHelper {
  private static readonly secret = new TextEncoder().encode(
    process.env.JWT_SECRET,
  );

  static async sign({
    data,
    subject,
    expirationTime,
  }: {
    subject: string;
    data: Record<string, unknown>;
    expirationTime: "15d";
  }) {
    return await new jose.SignJWT({ sub: subject, ...data })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expirationTime)
      .setSubject(subject)
      .sign(JWTHelper.secret);
  }

  static async verify({ token }: { token: string }) {
    const { payload } = await jose.jwtVerify(token, JWTHelper.secret);

    return payload;
  }
}