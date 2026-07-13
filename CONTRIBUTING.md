# Contributing

感谢您参与 EF Language Support 的开发。

## 提交问题

提交缺陷前，请先搜索现有 Issues。新的问题应尽可能包含：

- Visual Studio Code 与扩展版本；
- 操作系统和 EF 工具链版本；
- 最小可复现源码或工程配置；
- “易语言.飞扬”输出通道中的完整日志；
- 预期行为与实际行为。

请勿在公开问题中提交许可证文件、访问令牌、个人数据或其他敏感信息。

## 开发流程

1. Fork 仓库并基于 `main` 创建功能分支；
2. 使用 `pnpm install` 安装开发依赖；
3. 完成修改并为解析、工程格式或构建行为补充测试；
4. 运行 `pnpm test`；
5. 提交 Pull Request，并说明行为变化及验证方式。

代码应保持依赖精简，避免复制或提交官方 EF 编译器、类库、运行时及其授权文件。

## 提交信息

提交信息应简洁描述实际变更，例如：

```text
fix: quote compiler output paths containing spaces
feat: add workspace symbol filtering
docs: document custom compiler configuration
```

提交贡献即表示您同意按照仓库的 MIT License 提供相关代码和文档。
