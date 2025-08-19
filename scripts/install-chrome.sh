#!/bin/bash
echo "Installing Chrome dependencies..."
sudo apt-get update
sudo apt-get install -y wget gnupg2 ca-certificates
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-archive-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt-get update
sudo apt-get install -y google-chrome-stable
echo "Chrome installation completed"
