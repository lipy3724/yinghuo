#!/bin/bash

# 萤火AI系统部署脚本
echo "开始部署萤火AI系统更新..."

# 查找现有Node.js进程
echo "检查现有Node.js进程..."
NODE_PID=$(cat server.pid 2>/dev/null)

if [ -n "$NODE_PID" ]; then
  echo "找到服务器进程PID: $NODE_PID，正在停止..."
  kill $NODE_PID
  sleep 2
  
  # 确认进程已停止
  if ps -p $NODE_PID > /dev/null; then
    echo "服务器进程未正常停止，强制终止..."
    kill -9 $NODE_PID
    sleep 1
  fi
  
  echo "服务器进程已停止"
else
  echo "未找到服务器PID文件，尝试通过进程查找..."
  NODE_PID=$(ps -ef | grep "node server.js" | grep -v grep | awk '{print $2}')
  
  if [ -n "$NODE_PID" ]; then
    echo "找到服务器进程PID: $NODE_PID，正在停止..."
    kill $NODE_PID
    sleep 2
    
    # 确认进程已停止
    if ps -p $NODE_PID > /dev/null; then
      echo "服务器进程未正常停止，强制终止..."
      kill -9 $NODE_PID
      sleep 1
    fi
    
    echo "服务器进程已停止"
  else
    echo "未找到运行中的服务器进程"
  fi
fi

# 启动服务器
echo "正在启动服务器..."
nohup node server.js > server.log 2>&1 &

# 保存PID
echo $! > server.pid
echo "服务器已启动，PID: $(cat server.pid)"

echo "部署完成"
echo "查看服务器日志: tail -f server.log"
