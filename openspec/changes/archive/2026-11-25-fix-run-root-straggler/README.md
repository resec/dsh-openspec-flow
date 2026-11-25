# fix-run-root-straggler

测试入口在删除 run root 前终止它启动的进程组，使正常结束与 SIGINT/SIGTERM 后都不再有后代重建已删除的 root。
