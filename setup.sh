#!/bin/bash

# AlphaGenome MCP Server Setup Script
# This script helps set up the AlphaGenome MCP server with proper dependencies

set -e

echo "🧬 AlphaGenome MCP Server Setup"
echo "================================"

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This setup script is designed for macOS. Please follow the manual installation instructions in README.md"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for Python 3.10+
echo "🐍 Checking Python version..."
PYTHON_CMD=""

# Try different Python commands
for cmd in python3.12 python3.11 python3.10 python3; do
    if command_exists "$cmd"; then
        VERSION=$($cmd --version 2>&1 | cut -d' ' -f2)
        MAJOR=$(echo $VERSION | cut -d'.' -f1)
        MINOR=$(echo $VERSION | cut -d'.' -f2)
        
        if [[ $MAJOR -eq 3 && $MINOR -ge 10 ]]; then
            PYTHON_CMD=$cmd
            echo "✅ Found Python $VERSION at $cmd"
            break
        fi
    fi
done

if [[ -z "$PYTHON_CMD" ]]; then
    echo "❌ Python 3.10+ not found. Installing Python 3.11..."
    
    # Check if Homebrew is installed
    if ! command_exists brew; then
        echo "❌ Homebrew not found. Please install Homebrew first:"
        echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    
    echo "📦 Installing Python 3.11 via Homebrew..."
    brew install python@3.11
    
    # Update PATH for this session
    export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
    PYTHON_CMD="python3.11"
    
    if ! command_exists "$PYTHON_CMD"; then
        echo "❌ Failed to install Python 3.11. Please install manually."
        exit 1
    fi
    
    echo "✅ Python 3.11 installed successfully"
fi

# Install AlphaGenome package
echo "📦 Installing AlphaGenome Python package..."
if $PYTHON_CMD -c "import alphagenome" 2>/dev/null; then
    echo "✅ AlphaGenome package already installed"
else
    echo "Installing AlphaGenome package..."
    $PYTHON_CMD -m pip install --user alphagenome
    echo "✅ AlphaGenome package installed"
fi

# Update the TypeScript source to use the correct Python command
echo "🔧 Updating MCP server to use $PYTHON_CMD..."
if [[ "$PYTHON_CMD" != "python3" ]]; then
    # Create a backup
    cp src/index.ts src/index.ts.backup
    
    # Replace python3 with the correct command
    sed -i '' "s/spawn(\"python3\"/spawn(\"$PYTHON_CMD\"/g" src/index.ts
    echo "✅ Updated Python command in MCP server"
fi

# Build the project
echo "🔨 Building MCP server..."
npm run build
echo "✅ MCP server built successfully"

# Make Python script executable
chmod +x alphagenome_client.py
echo "✅ Made Python client executable"

# Test the Python setup
echo "🧪 Testing Python setup..."
if $PYTHON_CMD -c "import alphagenome; print('AlphaGenome package working correctly')"; then
    echo "✅ Python setup test passed"
else
    echo "❌ Python setup test failed"
    exit 1
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Get your AlphaGenome API key from: https://deepmind.google.com/science/alphagenome"
echo "2. Add the MCP server configuration to your settings:"
echo ""
echo "For Cline (VSCode), edit:"
echo "  /Users/$(whoami)/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
echo ""
echo "Add this configuration:"
echo "{"
echo "  \"mcpServers\": {"
echo "    \"alphagenome\": {"
echo "      \"command\": \"node\","
echo "      \"args\": [\"$(pwd)/build/index.js\"],"
echo "      \"env\": {"
echo "        \"ALPHAGENOME_API_KEY\": \"your-api-key-here\""
echo "      }"
echo "    }"
echo "  }"
echo "}"
echo ""
echo "Replace 'your-api-key-here' with your actual API key."
echo ""
echo "For more details, see README.md"
