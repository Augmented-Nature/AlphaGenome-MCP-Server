# AlphaGenome MCP Server - Installation Guide

This guide covers installation methods for the AlphaGenome MCP Server, supporting both local and remote deployment.

## Prerequisites

### Required Software

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **AlphaGenome API Key**: Obtain from [Google DeepMind](https://deepmind.google.com/science/alphagenome)

### System Requirements

- macOS, Linux, or Windows with WSL2
- Minimum 4GB RAM
- Internet connection for API access

---

## Installation Methods

### Method 1: Docker Installation (Recommended)

Deploy using Docker for isolated, reproducible environments:

#### Quick Start with Docker

1. **Clone the repository:**

```bash
git clone https://github.com/Augmented-Nature/AlphaGenome-MCP-Server.git
cd AlphaGenome-MCP-Server
```

2. **Set your API key:**

```bash
# Create .env file
echo "ALPHAGENOME_API_KEY=your-api-key-here" > .env
```

3. **Build and run with Docker Compose:**

```bash
docker-compose up -d
```

Or build and run manually:

```bash
# Build the image
docker build -t augmented-nature/alphagenome-server:latest .

# Run the container
docker run -d \
  --name alphagenome-mcp-server \
  -e ALPHAGENOME_API_KEY=your-api-key-here \
  -i -t \
  augmented-nature/alphagenome-server:latest
```

#### Docker Configuration for MCP

Add to your MCP settings file:

```json
{
  "mcpServers": {
    "alphagenome-server": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "alphagenome-mcp-server",
        "node",
        "/app/build/index.js"
      ],
      "disabled": false,
      "autoApprove": [],
      "timeout": 30
    }
  }
}
```

**Note:** Ensure the Docker container is running before starting your MCP client.

#### Docker Management

```bash
# Start the container
docker-compose start

# Stop the container
docker-compose stop

# View logs
docker-compose logs -f

# Restart the container
docker-compose restart

# Remove the container
docker-compose down
```

### Method 2: GitHub Installation (For Development)

Clone the repository and build from source:

```bash
# Clone the repository
git clone https://github.com/Augmented-Nature/AlphaGenome-MCP-Server.git
cd AlphaGenome-MCP-Server

# Install dependencies
npm install

# Build the project
npm run build

# Install Python dependencies
python3.10 -m pip install alphagenome
```

---

## Configuration

### Docker Environment Variables

When using Docker, configure environment variables in `.env` file or `docker-compose.yml`:

```yaml
environment:
  - ALPHAGENOME_API_KEY=your-api-key-here
  - NODE_ENV=production
```

### 1. Obtain AlphaGenome API Key

Visit [Google DeepMind AlphaGenome](https://deepmind.google.com/science/alphagenome) to request an API key.

### 2. Configure MCP Settings

#### For Claude Desktop / Cline

Add the server configuration to your MCP settings file:

**Location:**

- macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

**For Docker deployment (recommended):**

```json
{
  "mcpServers": {
    "alphagenome-server": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "alphagenome-mcp-server",
        "node",
        "/app/build/index.js"
      ],
      "disabled": false,
      "autoApprove": [],
      "timeout": 30
    }
  }
}
```

### 3. Verify Python Installation

Ensure Python 3.10+ and the alphagenome package are installed:

```bash
# Check Python version
python3.10 --version

# Verify alphagenome package
python3.10 -c "import alphagenome; print(alphagenome.__version__)"
```

---

## Verification

### Test the Installation

1. **Restart your MCP client** (VS Code, Claude Desktop, etc.)

2. **Check server connection:**
   - Look for "alphagenome-server" in the Connected MCP Servers list
   - Verify no error messages appear in the logs

3. **Test a simple tool:**

Use the `get_supported_outputs` tool to verify the server is working:

```javascript
// This should return AlphaGenome API capabilities
{
  "output_types": { ... },
  "supported_sequence_lengths": { ... },
  "supported_organisms": ["human"]
}
```

---

## Troubleshooting

### Docker-Specific Issues

#### 1. Container Not Starting

**Error:** `Container exits immediately`

**Solution:**

```bash
# Check container logs
docker logs alphagenome-mcp-server

# Verify API key is set
docker exec alphagenome-mcp-server env | grep ALPHAGENOME_API_KEY

# Rebuild the image
docker-compose build --no-cache
docker-compose up -d
```

#### 2. Python Package Not Found in Container

**Error:** `No module named 'alphagenome'` in Docker logs

**Solution:**

```bash
# Rebuild with no cache
docker-compose build --no-cache

# Or manually install in running container
docker exec -it alphagenome-mcp-server python3 -m pip install alphagenome
```

#### 3. MCP Client Cannot Connect to Docker Container

**Solution:**

- Ensure container is running: `docker ps | grep alphagenome`
- Verify container name matches MCP configuration
- Check container logs: `docker logs alphagenome-mcp-server`
- Restart container: `docker-compose restart`

#### 4. Resource Limits

If experiencing performance issues, adjust resource limits in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: "4"
      memory: 4G
```

### Common Issues

#### 1. Python Package Not Found

**Error:** `No module named 'alphagenome'`

**Solution:**

```bash
# Install for Python 3.10
python3.10 -m pip install alphagenome

# Or for default Python 3
python3 -m pip install alphagenome
```

#### 2. Python Version Too Old

**Error:** `Requires-Python >=3.10`

**Solution:**

- Install Python 3.10 or higher
- Update the server configuration to use the correct Python path

#### 3. API Key Not Set

**Error:** `ALPHAGENOME_API_KEY environment variable is required`

**Solution:**

- Verify the API key is set in your MCP settings
- Ensure there are no typos in the environment variable name

#### 4. Server Not Connecting

**Solution:**

- Check the MCP settings file syntax (valid JSON)
- Verify the command path is correct
- Check server logs for error messages
- Restart your MCP client

---

## Updating

### Update Docker Image

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Update from GitHub (Development)

```bash
cd AlphaGenome-MCP-Server
git pull origin main
npm install
npm run build
```

---

## Uninstallation

### Remove Docker Deployment

```bash
# Stop and remove containers
docker-compose down

# Remove images
docker rmi augmented-nature/alphagenome-server:latest

# Remove volumes (if any)
docker volume prune
```

### Remove Python Package (if installed locally)

```bash
python3.10 -m pip uninstall alphagenome
```

### Remove Configuration

Delete the server entry from your MCP settings file.

---

## Advanced Configuration

### Custom Python Path

If you need to specify a custom Python path:

```json
{
  "mcpServers": {
    "alphagenome-server": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "ALPHAGENOME_API_KEY": "your-api-key-here",
        "PYTHON_PATH": "/custom/path/to/python3.10"
      }
    }
  }
}
```

Then update `src/index.ts` to use `process.env.PYTHON_PATH || "python3.10"`.

### Timeout Configuration

For large genomic analyses, increase the timeout:

```json
{
  "timeout": 120
}
```

---

## Support

- **Issues**: [GitHub Issues](https://github.com/Augmented-Nature/AlphaGenome-MCP-Server/issues)
- **Documentation**: [README.md](README.md)
- **API Documentation**: [AlphaGenome API Docs](https://www.alphagenomedocs.com/api/index.html)

---

## License

MIT License - See [LICENSE](LICENSE) file for details.
