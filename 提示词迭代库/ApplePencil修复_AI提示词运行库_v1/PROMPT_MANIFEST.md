# PROMPT MANIFEST

版本：**v1.0**

建议执行顺序：

## 00_启动
- `00_启动/00_START_HERE.md`
- `00_启动/01_MASTER_EXECUTION_PROMPT.md`
- `00_启动/02_TASK_ROUTER.md`

## 01_全局硬约束
- `01_全局硬约束/00_HARD_CONSTRAINTS.md`
- `01_全局硬约束/01_坐标系统不变量.md`
- `01_全局硬约束/02_数据安全约束.md`
- `01_全局硬约束/03_PhaseGate规则.md`

## 02_PhaseA_坐标修复
- `02_PhaseA_坐标修复/00_PHASE_A_SYSTEM_PROMPT.md`
- `02_PhaseA_坐标修复/01_源码定位与根因调查.md`
- `02_PhaseA_坐标修复/02_几何审计.md`
- `02_PhaseA_坐标修复/03_单一坐标系重构.md`
- `02_PhaseA_坐标修复/04_LayoutProfile锁定.md`
- `02_PhaseA_坐标修复/05_LegacyDrawing保护与迁移.md`
- `02_PhaseA_坐标修复/06_GeometryDebugOverlay.md`
- `02_PhaseA_坐标修复/07_Hover与Stroke竞态.md`
- `02_PhaseA_坐标修复/08_Debug断言.md`

## 05_测试与验收
- `05_测试与验收/00_TEST_MASTER.md`
- `05_测试与验收/01_PhaseA真机测试.md`
- `05_测试与验收/02_PhaseB真机测试.md`
- `05_测试与验收/03_自动化测试清单.md`
- `05_测试与验收/04_回归测试.md`
- `05_测试与验收/05_Release_Blockers.md`

## 03_PhaseB_工具系统
- `03_PhaseB_工具系统/00_PHASE_B_SYSTEM_PROMPT.md`
- `03_PhaseB_工具系统/01_InkToolController.md`
- `03_PhaseB_工具系统/02_圆形笔按钮.md`
- `03_PhaseB_工具系统/03_纵向工具栏.md`
- `03_PhaseB_工具系统/04_工具到PencilKit映射.md`
- `03_PhaseB_工具系统/05_颜色与粗细.md`
- `03_PhaseB_工具系统/06_ApplePencil双击.md`
- `03_PhaseB_工具系统/07_PreviousWritingTool逻辑.md`
- `03_PhaseB_工具系统/08_Stroke期间工具切换.md`
- `03_PhaseB_工具系统/09_工具栏位置与本地偏好.md`
- `03_PhaseB_工具系统/10_PencilPro未来兼容.md`

## 04_集成与兼容
- `04_集成与兼容/00_现有项目接入策略.md`
- `04_集成与兼容/01_AnnotationSync不变.md`
- `04_集成与兼容/02_EXTEND兼容.md`
- `04_集成与兼容/03_Rotation_Zoom兼容.md`
- `04_集成与兼容/04_SwiftUI_Uikit桥接.md`

## 06_代码审查
- `06_代码审查/00_CODE_REVIEW_MASTER.md`
- `06_代码审查/01_GeometryReview.md`
- `06_代码审查/02_InkToolReview.md`
- `06_代码审查/03_MigrationReview.md`

## 07_恢复与回滚
- `07_恢复与回滚/00_ROLLBACK_POLICY.md`
- `07_恢复与回滚/01_AnnotationBackupRestore.md`
- `07_恢复与回滚/02_安全降级.md`

## 08_执行输出模板
- `08_执行输出模板/00_调查报告模板.md`
- `08_执行输出模板/01_实施完成报告模板.md`
- `08_执行输出模板/02_PR说明模板.md`

## 09_Profiles
- `09_Profiles/00_INVESTIGATION_PROFILE.md`
- `09_Profiles/01_PHASE_A_IMPLEMENTATION_PROFILE.md`
- `09_Profiles/02_PHASE_B_IMPLEMENTATION_PROFILE.md`
- `09_Profiles/03_CODE_REVIEW_PROFILE.md`

## 10_测试场景
- `10_测试场景/00_BUG_REPRO_FIXTURE.md`
- `10_测试场景/01_LEGACY_LAYOUT_SCENARIO.md`
- `10_测试场景/02_NEW_LAYOUT_SCENARIO.md`
- `10_测试场景/03_DOUBLE_TAP_SCENARIO.md`
- `10_测试场景/04_LASSO_ERASER_SCENARIO.md`
- `10_测试场景/05_EXTEND_WHILE_WRITING.md`

## 90_来源与设计映射
- `90_来源与设计映射/00_DESIGN_TO_PROMPT_MAP.md`
- `90_来源与设计映射/01_禁止误读.md`
