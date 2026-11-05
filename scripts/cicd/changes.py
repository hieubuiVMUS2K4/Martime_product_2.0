"""Select the components affected by a commit range, including renamed files."""
import os
import subprocess
import sys


def components(app, files):
    backend = frontend = False
    for name in files:
        if name.startswith((".github/workflows/", "scripts/cicd/")) or name in (
            "global.json", "NuGet.Config", "nuget.config", "Directory.Build.props",
            "Directory.Build.targets", "Directory.Packages.props", "product.sln",
        ):
            backend = frontend = True
        if name.startswith(("shore_product/shared/", "edge_product/shared/")):
            backend = True
        if name.startswith((f"{app}_product/backend/", f"{app}_product/backend.Tests/")):
            backend = True
        if app == "edge" and name.startswith(("edge_product/edge-services/", "edge_product/edge-services.Tests/")):
            backend = True
        frontend_dir = "frontend" if app == "shore" else "frontend-edge"
        if name.startswith(f"{app}_product/{frontend_dir}/"):
            frontend = True
        production = f"{app}_product/production/"
        if name == production + "Dockerfile.backend":
            backend = True
        if name == production + "Dockerfile.frontend" or name.startswith(production + "nginx/") or name == production + "docker-entrypoint.sh":
            frontend = True
    return backend, frontend


def main():
    app, base, head = sys.argv[1:]
    if app not in ("shore", "edge"):
        raise SystemExit("Unknown application")
    if not base or set(base) == {"0"}:
        backend = frontend = True
    else:
        changed = subprocess.check_output(
            ["git", "diff", "--no-renames", "--name-only", "-z", base, head],
        ).decode().split("\0")
        backend, frontend = components(app, changed)
    print(f"backend={str(backend).lower()}")
    print(f"frontend={str(frontend).lower()}")
    print(f"image_prefix=ghcr.io/{os.environ['GITHUB_REPOSITORY'].lower()}/{app}")


if __name__ == "__main__":
    main()
