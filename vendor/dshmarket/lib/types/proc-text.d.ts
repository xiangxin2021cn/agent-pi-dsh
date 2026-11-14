/**
 * Text a child process wrote, decoded by the encoding it actually used.
 *
 * A Windows console gives a child process the console code page, and a
 * Chinese system is 936 (GBK): `cmd.exe` says "不是内部或外部命令" in GBK
 * bytes. The pipe carries bytes and no encoding, so decoding them as UTF-8
 * turned every one of those bytes into U+FFFD — the install error read
 * `'dsh' �����ڲ����ⲿ���Ҳ���ǿ����еĳ���` (#1122), which tells the person
 * looking at it nothing at all.
 *
 * UTF-8 is tried first and strictly, so text that IS UTF-8 decodes exactly as
 * before; only bytes that cannot be UTF-8 fall through to the code page. No
 * `chcp` probe: that costs a process per install, and the answer is already
 * in the bytes.
 */
/** Decode a complete child output buffer. */
export declare function decodeChildOutput(bytes: Buffer, platform?: NodeJS.Platform): string;
/**
 * The last `limit` bytes of one child stream, decoded when it is asked for.
 *
 * Kept as bytes rather than as a string because the encoding cannot be known
 * from a prefix: the first chunks of a pnpm run are ASCII either way, and
 * decoding each chunk as it arrives fixes the encoding before the text that
 * decides it has been seen.
 */
export declare function createOutputBuffer(limit: number, platform?: NodeJS.Platform): {
    push(chunk: Buffer): void;
    text(): string;
};
