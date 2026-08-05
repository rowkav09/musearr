variable "REGISTRY" {
  default = "ghcr.io/rowkav09"
}

variable "TAG" {
  default = "dev"
}

variable "VERSION" {
  default = "dev"
}

variable "REVISION" {
  default = "unknown"
}

group "default" {
  targets = ["api", "worker", "web", "migrate"]
}

target "common" {
  context = "."
  args = {
    VERSION = VERSION
    REVISION = REVISION
  }
}

target "api" {
  inherits = ["common"]
  dockerfile = "infra/docker/Dockerfile.api"
  tags = ["${REGISTRY}/musearr-api:${TAG}"]
}

target "worker" {
  inherits = ["common"]
  dockerfile = "infra/docker/Dockerfile.worker"
  tags = ["${REGISTRY}/musearr-worker:${TAG}"]
}

target "web" {
  inherits = ["common"]
  dockerfile = "infra/docker/Dockerfile.web"
  tags = ["${REGISTRY}/musearr-web:${TAG}"]
}

target "migrate" {
  inherits = ["common"]
  dockerfile = "infra/docker/Dockerfile.migrate"
  tags = ["${REGISTRY}/musearr-migrate:${TAG}"]
}
