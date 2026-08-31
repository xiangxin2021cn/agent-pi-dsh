# Unreleased

3.5.2 已完成 DSH alpha.3 正式升级和不可变发布流程，见 [notes-3.5.2.md](./notes-3.5.2.md)。此后改动写在本页。

- 官网下载区同时提供 Windows、macOS、Linux 构件，并在三个主平台资产全部上传后自动同步 GitHub Latest Release；接口失败时保留已验证的 3.5.2 静态链接。
- 内核升级必须提高应用版本；标签和 Release 资源不再允许同版本覆盖。
