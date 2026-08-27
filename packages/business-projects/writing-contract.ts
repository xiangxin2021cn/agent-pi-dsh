export const TENDER_WRITING_CONTRACT_BRIEF =
  "Writing: produce a bid-team artifact for THIS tender. Use the employer's terms, item codes, clause/sheet locators, and measurement language from the assigned sources. Do not use AI filler (Furthermore, Moreover, It is important to note, In conclusion, leverage, robust, seamless, cutting-edge, 综上所述, 值得注意的是, 赋能, 全方位, 一站式, 确保万无一失). Do not invent generic method-theatre or a textbook TOC the tender does not require. Formal returnables follow the employer's headings and language. Read skill tender-formal-writing before drafting. Citations: every spec/contract/method fact carries a locator token — [kb:slug:chunkId] or [src:path#L10-L25]. Tokens are annotations, not quotations; do not paste source excerpts into the deliverable. Facts with no resolvable token are gaps and must be stated as gaps; the QA step verifies every token and returns orphans for rework."

export const TENDER_WRITING_CONTRACT_DRAFT = `<tender_writing_contract>
[skill:tender-formal-writing]
硬禁令（写法见该 skill，不要在此发挥）：
- 按本标书写作：雇主术语、条款号、清单编码、计量支付用语、回标目录。
- 去 AI 味道：禁止综上所述 / 值得注意的是 / 赋能 / 全方位 / Furthermore / It is important to note / leverage / robust。
- 有条款写条款，有数字写数字，有缺口写缺口；禁止教材腔与文件目录腔。
引用令牌（质检逐一核验，孤儿引用退回重写）：
- 规范/合同/标准方法类事实句，句尾只给出处令牌：知识库用 [kb:slug:chunkId]（取自 kb_search / kb_find_* 命中的 citation 字段，禁止手编）；本项目资料用 [src:路径#L起-L止]（路径=登记原件或解析稿，相对项目目录或绝对路径，行号对应该文本文件）。
- 令牌是标注，不是原文。禁止把规范/合同大段原文或未筛选的证据块贴进正式文件；读者点击标注即可看到源文件、页或行、题名或段落。
- 给不出令牌的事实 = 缺口，明写"缺口：待补充XX原文"；禁止无令牌引用凭记忆断言规范条文。
</tender_writing_contract>`
