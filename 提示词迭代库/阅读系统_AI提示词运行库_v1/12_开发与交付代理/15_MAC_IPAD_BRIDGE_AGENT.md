# Reading Bridge Implementation Agent

> Prompt ID：`dev.bridge`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

实现本地网络连接与可靠双向流，模型不参与逐消息同步决策。

## Transport
Bonjour discovery + TLS/WebSocket；persistent device crypto identity；SAS first pairing；Keychain keys。

## Reliability
server_seq/client_seq、message_id dedup、Journal/Outbox、ACK after durable、Snapshot/Delta、session epoch。

## Authority
Mac CONTENT source；iPad Presentation/Annotation/View origin。Connection bidirectional but authority asymmetric。

## Protocol separation
Reading Core admin API 只 local；iPad 只 Bridge protocol。不要让 iPad 调 create_node。
