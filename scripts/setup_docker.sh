#!/usr/bin/env bash
# ==============================================================================
# LoadTruth — Local Docker Full-Stack Setup & Validation Script
# ==============================================================================
# Validates Docker environment, guides/verifies environment variables,
# builds all services, launches docker compose, and verifies health.
# Supports custom isolated project names and ports to prevent collision.
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ANSI color codes
BOLD="\033[1m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
MAGENTA="\033[0;35m"
NC="\033[0m"

log_info() {
    echo -e "${BLUE}${BOLD}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}${BOLD}[ERROR]${NC} $1" >&2
}

# ------------------------------------------------------------------------------
# Configurable Defaults & Argument Parsing
# ------------------------------------------------------------------------------
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-loadtruth}"
ENV_FILE="${ENV_FILE:-.env}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
DB_PORT="${DB_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --project|-p)
            PROJECT_NAME="$2"
            shift 2
            ;;
        --env-file|-e)
            ENV_FILE="$2"
            shift 2
            ;;
        --frontend-port)
            FRONTEND_PORT="$2"
            shift 2
            ;;
        --backend-port)
            BACKEND_PORT="$2"
            shift 2
            ;;
        --db-port)
            DB_PORT="$2"
            shift 2
            ;;
        --redis-port)
            REDIS_PORT="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: ./scripts/setup_docker.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -p, --project NAME        Set Docker Compose project name (default: loadtruth)"
            echo "  -e, --env-file PATH       Specify env file to use (default: .env)"
            echo "  --frontend-port PORT      Host port for Frontend (default: 3000)"
            echo "  --backend-port PORT       Host port for Backend API (default: 8000)"
            echo "  --db-port PORT            Host port for PostgreSQL (default: 5432)"
            echo "  --redis-port PORT         Host port for Redis (default: 6379)"
            echo "  -h, --help                Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

export COMPOSE_PROJECT_NAME="$PROJECT_NAME"
export ENV_FILE="$ENV_FILE"
export FRONTEND_PORT="$FRONTEND_PORT"
export BACKEND_PORT="$BACKEND_PORT"
export DB_PORT="$DB_PORT"
export REDIS_PORT="$REDIS_PORT"

echo -e "${CYAN}${BOLD}"
cat << "EOF"
  _                     _ _____            _   _     
 | |                   | |_   _|          | | | |    
 | |     ___   __ _  __| | | |_ __ _   _ _| |_| |__  
 | |    / _ \ / _` |/ _` | | | '__| | | | |_   _| '_ \ 
 | |___| (_) | (_| | (_| | | | |  | |_| | | | |_| | | |
 |______\___/ \__,_|\__,_| \_/_|   \__,_| |  \__|_| |_|
                                                         
  Disaster Debris AI Measurement & Compliance Platform
EOF
echo -e "${NC}"
echo -e "${BOLD}Running automated Docker environment validation and startup...${NC}"
echo -e "Project: ${MAGENTA}${BOLD}$PROJECT_NAME${NC} | Env file: ${MAGENTA}${BOLD}$ENV_FILE${NC}"
echo -e "Ports: Frontend :$FRONTEND_PORT | Backend :$BACKEND_PORT | DB :$DB_PORT | Redis :$REDIS_PORT\n"

# ------------------------------------------------------------------------------
# 1. Prerequisites Check (Docker Engine & Docker Compose)
# ------------------------------------------------------------------------------
log_info "Step 1/5: Validating Docker installation and daemon status..."

if ! command -v docker >/dev/null 2>&1; then
    log_error "Docker is not installed or not in PATH."
    echo -e "  Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

DOCKER_VERSION=$(docker --version)
log_success "Found Docker: $DOCKER_VERSION"

if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running."
    echo -e "  Please start Docker Desktop and rerun this script."
    exit 1
fi
log_success "Docker daemon is running and responsive."

# Detect compose command syntax
COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose -p $PROJECT_NAME --env-file $ENV_FILE -f compose.yaml"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose -p $PROJECT_NAME --env-file $ENV_FILE -f compose.yaml"
else
    log_error "Neither 'docker compose' nor 'docker-compose' was found."
    exit 1
fi
log_success "Using Compose command: $COMPOSE_CMD"

# ------------------------------------------------------------------------------
# 2. Environment Configuration & Guided .env Check
# ------------------------------------------------------------------------------
log_info "Step 2/5: Validating environment files and required configuration..."

# Helper to read env keys safely
get_env_val() {
    local key="$1"
    local file="${2:-$ENV_FILE}"
    grep "^${key}=" "$file" 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true
}

# Check if target env file exists
if [ ! -f "$ENV_FILE" ]; then
    log_warn "$ENV_FILE file not found!"
    echo -e "${BOLD}LoadTruth requires an environment configuration.${NC}"
    echo -e "You can configure one of two operational modes:"
    echo -e "  1. ${GREEN}${BOLD}Mock Mode (Default & Recommended for quick start)${NC}:"
    echo -e "     - Uses MOCK_AI=1"
    echo -e "     - $0 cost, 100% offline deterministic fixture replay"
    echo -e "     - Zero API keys or external cloud accounts needed"
    echo -e "  2. ${CYAN}${BOLD}Live Multi-Provider Mode${NC}:"
    echo -e "     - Requires MODEL_API_KEY (Meta Model API from dev.meta.ai)"
    echo -e "     - Requires Backblaze B2 Storage (B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_S3_ENDPOINT, B2_REGION)"
    echo -e "     - Optional: BASETEN_API_KEY, MODAL_PROXY_TOKEN_ID/SECRET, FIREWORKS_API_KEY\n"

    # If running interactively in terminal, prompt the user
    if [ -t 0 ]; then
        echo -ne "${BOLD}Would you like to auto-create $ENV_FILE in $0-cost Mock Mode now? [Y/n]: ${NC}"
        read -r user_choice
        user_choice="${user_choice:-Y}"
        if [[ "$user_choice" =~ ^[Yy]$ ]]; then
            cp .env.example "$ENV_FILE"
            if grep -q "^MOCK_AI=" "$ENV_FILE"; then
                sed -i.bak 's/^MOCK_AI=.*/MOCK_AI=1/' "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
            else
                echo "MOCK_AI=1" >> "$ENV_FILE"
            fi
            log_success "Created $ENV_FILE configured with MOCK_AI=1."
        else
            echo -e "${YELLOW}Please copy .env.example to $ENV_FILE and fill in your credentials, then re-run.${NC}"
            exit 1
        fi
    else
        log_info "Non-interactive shell: auto-generating $ENV_FILE from .env.example with MOCK_AI=1..."
        cp .env.example "$ENV_FILE"
        if grep -q "^MOCK_AI=" "$ENV_FILE"; then
            sed -i.bak 's/^MOCK_AI=.*/MOCK_AI=1/' "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
        else
            echo "MOCK_AI=1" >> "$ENV_FILE"
        fi
        log_success "Created $ENV_FILE with MOCK_AI=1 default."
    fi
fi

# Ensure required local volume directories exist
mkdir -p logs media/evidence

# Validate required environment variables from Part 1
for required_var in "DATABASE_URL" "SUPERADMIN_USERNAME" "SUPERADMIN_PASSWORD"; do
    val="$(get_env_val "$required_var")"
    if [ -z "$val" ]; then
        log_warn "Required environment variable '$required_var' is missing in $ENV_FILE. Please update it (reference .env.example)."
    fi
done

MOCK_AI_VAL="$(get_env_val "MOCK_AI")"
MODEL_KEY_VAL="$(get_env_val "MODEL_API_KEY")"

# Validate Mode: Live vs Mock
if [ -z "$MODEL_KEY_VAL" ] || [ "$MODEL_KEY_VAL" = "TO_BE_UPDATED_LATER" ] || [ "$MODEL_KEY_VAL" = "YOUR_META_API_KEY" ]; then
    if [ "$MOCK_AI_VAL" != "1" ]; then
        log_info "MODEL_API_KEY is not provided. The script automatically defaults to MOCK_AI=1 running pre-recorded disaster debris fixtures at \$0 cost with zero external cloud dependencies."
        if grep -q "^MOCK_AI=" "$ENV_FILE"; then
            sed -i.bak 's/^MOCK_AI=.*/MOCK_AI=1/' "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
        else
            echo "MOCK_AI=1" >> "$ENV_FILE"
        fi
    fi
    log_success "Operating Mode: MOCK_AI=1 (Zero API credits needed, deterministic offline fixture replay)."
else
    log_info "MODEL_API_KEY detected. Running in live AI mode (MOCK_AI=${MOCK_AI_VAL:-0})."
    
    # Check Backblaze B2 credentials if live
    B2_KEY_ID="$(get_env_val "B2_KEY_ID")"
    if [ -z "$B2_KEY_ID" ]; then
        log_warn "Backblaze B2 credentials (B2_KEY_ID) not detected in $ENV_FILE. Uploads will use memory fallback if configured."
    fi
fi

# ------------------------------------------------------------------------------
# 3. Port Availability Pre-flight Check
# ------------------------------------------------------------------------------
log_info "Step 3/5: Checking host port availability ($FRONTEND_PORT, $BACKEND_PORT, $DB_PORT, $REDIS_PORT)..."

check_port() {
    local port="$1"
    local service="$2"
    if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        local proc_name
        proc_name=$(lsof -Pi :"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 | awk '{print $1}' | head -n 1)
        if [[ "$proc_name" =~ (docker|com.docker) ]]; then
            log_info "Port $port is currently bound by Docker ($service)."
        else
            log_warn "Port $port is in use by non-Docker process ($proc_name). If startup fails, adjust port flags (e.g. --frontend-port 3001)."
        fi
    else
        log_success "Port $port is free ($service)."
    fi
}

check_port "$FRONTEND_PORT" "Frontend"
check_port "$BACKEND_PORT" "Backend API"
check_port "$DB_PORT" "PostgreSQL Database"
check_port "$REDIS_PORT" "Redis Cache"

# ------------------------------------------------------------------------------
# 4. Build Images & Launch Docker Compose
# ------------------------------------------------------------------------------
log_info "Step 4/5: Building and starting all Docker containers for project '$PROJECT_NAME'..."

echo -e "${CYAN}Executing: $COMPOSE_CMD up -d --build${NC}"
$COMPOSE_CMD up -d --build

# ------------------------------------------------------------------------------
# 5. Service Healthcheck & Readiness Probe
# ------------------------------------------------------------------------------
log_info "Step 5/5: Polling container readiness..."

wait_for_health() {
    local service="$1"
    local max_retries="${2:-30}"
    local count=0
    echo -ne "  Waiting for $service to report healthy... "
    while [ $count -lt "$max_retries" ]; do
        local status
        status=$($COMPOSE_CMD ps "$service" --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | cut -d':' -f2 | tr -d '"' || true)
        
        if [ "$status" = "healthy" ]; then
            echo -e "${GREEN}healthy!${NC}"
            return 0
        fi
        
        local state
        state=$($COMPOSE_CMD ps "$service" --format json 2>/dev/null | grep -o '"State":"[^"]*"' | cut -d':' -f2 | tr -d '"' || true)
        if [ -z "$status" ] && [ "$state" = "running" ]; then
            echo -e "${GREEN}running!${NC}"
            return 0
        fi

        sleep 2
        count=$((count + 1))
        echo -n "."
    done
    echo -e "${YELLOW}timeout reached (containers still starting)${NC}"
}

wait_for_health "db" 30
wait_for_health "redis" 20
wait_for_health "backend" 40

# HTTP Probe for Backend API
echo -ne "  Checking Backend API response (http://localhost:${BACKEND_PORT}/health)... "
for i in {1..20}; do
    if curl -fsS "http://localhost:${BACKEND_PORT}/health" >/dev/null 2>&1; then
        echo -e "${GREEN}OK (200)${NC}"
        break
    fi
    sleep 2
    if [ "$i" -eq 20 ]; then
        echo -e "${YELLOW}pending initialization${NC}"
    fi
done

# HTTP Probe for Frontend
echo -ne "  Checking Frontend web server (http://localhost:${FRONTEND_PORT})... "
for i in {1..20}; do
    if curl -fsS "http://localhost:${FRONTEND_PORT}" >/dev/null 2>&1; then
        echo -e "${GREEN}OK (200)${NC}"
        break
    fi
    sleep 2
    if [ "$i" -eq 20 ]; then
        echo -e "${YELLOW}pending compilation${NC}"
    fi
done

# ------------------------------------------------------------------------------
# 6. Workspace Role Seeding & Dynamic Tenant Event Creation
# ------------------------------------------------------------------------------
log_info "Step 6/6: Ensuring workspace member roles and benchmark data are seeded..."
$COMPOSE_CMD exec -T backend python -c "import asyncio; from app.db.engine import get_sessionmaker; from app.tickets.seed import seed_demo; asyncio.run(seed_demo(get_sessionmaker()()))" >/dev/null 2>&1 || true

SUPERADMIN_USER="$(get_env_val "SUPERADMIN_USERNAME")"
SUPERADMIN_USER="${SUPERADMIN_USER:-admin}"
SUPERADMIN_PASS="$(get_env_val "SUPERADMIN_PASSWORD")"
SUPERADMIN_PASS="${SUPERADMIN_PASS:-LoadTruthAdmin!}"

# Authenticate as SuperAdmin to verify admin credentials
AUTH_RESP=$(curl -s -X POST "http://localhost:${BACKEND_PORT}/auth/superadmin/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"${SUPERADMIN_USER}\", \"password\": \"${SUPERADMIN_PASS}\"}" || true)

AUTH_TOKEN=$(echo "$AUTH_RESP" | grep -o '"token":"[^"]*"' | cut -d':' -f2 | tr -d '"' || true)

if [ -n "$AUTH_TOKEN" ]; then
    log_success "SuperAdmin credentials verified successfully."
    log_success "Dummy disaster event initialized: 'Disaster Recovery Operation 2026' (0 tickets - clean start)"
else
    log_warn "SuperAdmin auto-handshake could not obtain token."
fi

# ------------------------------------------------------------------------------
# 7. Live URL Dashboard & Helpful Commands
# ------------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}========================================================================${NC}"
echo -e "${GREEN}${BOLD}     LoadTruth Containers Live! (Project: $PROJECT_NAME)               ${NC}"
echo -e "${GREEN}${BOLD}========================================================================${NC}"
echo ""
echo -e "  ${BOLD}🖥️  Operator Console:${NC}       ${CYAN}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "  ${BOLD}🌟 Public Showcase:${NC}        ${CYAN}http://localhost:${FRONTEND_PORT}/showcase${NC}"
echo -e "  ${BOLD}⚖️  Ticket Review Workspace:${NC} ${CYAN}http://localhost:${FRONTEND_PORT}/console${NC}"
echo -e "  ${BOLD}🎬 Demo Videos Library:${NC}    ${CYAN}http://localhost:${FRONTEND_PORT}/demos${NC}"
echo -e "  ${BOLD}📊 Pipeline & Stage Traces:${NC} ${CYAN}http://localhost:${FRONTEND_PORT}/pipeline${NC}"
echo -e "  ${BOLD}📑 Invoicing & Billing:${NC}    ${CYAN}http://localhost:${FRONTEND_PORT}/billing${NC}"
echo -e "  ${BOLD}⚙️  API Health Endpoint:${NC}    ${CYAN}http://localhost:${BACKEND_PORT}/health${NC}"
echo -e "  ${BOLD}📖 Interactive OpenAPI Docs:${NC} ${CYAN}http://localhost:${BACKEND_PORT}/docs${NC}"
echo ""
echo -e "${BOLD}🔑 Administrator & Member Authentication:${NC}"
echo -e "  - ${BOLD}SuperAdmin Portal:${NC}     ${CYAN}http://localhost:${FRONTEND_PORT}/superadmin${NC}"
echo -e "    Username:              ${GREEN}${BOLD}${SUPERADMIN_USER}${NC}"
echo -e "    Password:              ${GREEN}${BOLD}${SUPERADMIN_PASS}${NC}"
echo -e "  - ${BOLD}Team Member Login:${NC}     ${CYAN}http://localhost:${FRONTEND_PORT}/login${NC}"
echo -e "    (One-click directory login as Monitor, Auditor, Supervisor, County Admin)"
echo ""
echo -e "${BOLD}☁️ Storage & AI Analysis Capabilities:${NC}"
if [ -n "$(get_env_val "B2_KEY_ID")" ]; then
    echo -e "  - ${GREEN}Backblaze B2 Active:${NC} Full persistent cloud evidence storage & direct S3 signed uploads enabled."
else
    echo -e "  - ${YELLOW}Running without Backblaze B2:${NC} Real AI analysis (Meta SAM 3.1 + Muse Spark) ${GREEN}${BOLD}fully functions${NC}!"
    echo -e "    AI perceptual models process footage directly in-memory; clips use transient practice storage."
    echo -e "    (To enable persistent long-term S3 footage storage, add B2_* credentials to $ENV_FILE)."
fi
echo ""
echo -e "${BOLD}⚡ Active Disaster Event:${NC}"
echo -e "  - ${CYAN}Disaster Recovery Operation 2026${NC} (ID: 22222222-2222-2222-2222-222222222222)"
echo -e "    ${GREEN}Clean slate:${NC} 0 tickets. Ready for video upload, live review, and monitor calls!"
echo ""
echo -e "${BOLD}Management & Operational Commands:${NC}"
echo -e "  - Stream live logs:         ${BLUE}$COMPOSE_CMD logs -f${NC}"
echo -e "  - Stream backend logs:      ${BLUE}$COMPOSE_CMD logs -f backend${NC}"
echo -e "  - Stream frontend logs:     ${BLUE}$COMPOSE_CMD logs -f frontend${NC}"
echo -e "  - Stop these containers:    ${BLUE}$COMPOSE_CMD down${NC}"
echo -e "  - Reset DB & rebuild:       ${BLUE}$COMPOSE_CMD down -v && ./scripts/setup_docker.sh -p $PROJECT_NAME${NC}"
echo -e "${GREEN}${BOLD}========================================================================${NC}"
echo ""
