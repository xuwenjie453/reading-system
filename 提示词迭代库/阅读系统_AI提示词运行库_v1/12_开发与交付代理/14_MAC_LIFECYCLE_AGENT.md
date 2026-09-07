# Mac ReadingDaemon Lifecycle / Recovery Implementation Agent

> Prompt ID：`dev.mac_lifecycle`  
> 版本：`runtime-v1.0`  
> 模式：**IMPLEMENTATION**  
> 日期：**2026-09-07**

启动严格：Store → transaction recovery → integrity → schema/migration → core services → Bridge → device sync → session reconcile → READY。

实现：single instance、boot id、clean shutdown marker、NORMAL/RECOVERY/SAFE/MIGRATION modes、fast/deep integrity、recovery journal、parse job checkpoint、derived rebuild throttling。

iPad reconnect 后先同步 data，最后 VIEW_SNAPSHOT 建新 Focus baseline。LastKnownFocus 只能是历史。Interrupted Episode 不视为 SKIP。

CREATE conditional auto-nav 不跨 epoch 恢复；explicit user nav 可有限 fresh reissue。
