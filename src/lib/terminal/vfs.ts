export interface VfsNode {
  id: string;
  name: string;
  path: string;
  type: "DIRECTORY" | "FILE";
  size: number;
  permissions: string;
  modified: string;
  children?: VfsNode[];
}

/**
 * Normalize a virtual filesystem path against the current working directory.
 * Strictly sandboxed to the virtual root '/': '.' and '..' resolve cleanly and
 * cannot escape above '/'. Never maps to or reads host filesystem paths.
 */
export function normalizeVirtualPath(cwd: string, inputPath?: string): string {
  const raw = (inputPath ?? "").trim();
  if (raw.includes("\0")) {
    throw new Error("Invalid path: null byte not permitted");
  }
  if (!raw || raw === ".") {
    return cwd || "/";
  }

  const baseSegments = raw.startsWith("/")
    ? []
    : (cwd || "/").split("/").filter(Boolean);

  const rawSegments = raw.split("/");
  const resolved = [...baseSegments];

  for (const seg of rawSegments) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (resolved.length > 0) {
        resolved.pop();
      }
      continue;
    }
    resolved.push(seg);
  }

  return resolved.length === 0 ? "/" : `/${resolved.join("/")}`;
}

export function splitParentAndName(resolvedPath: string): {
  parentPath: string;
  name: string;
} {
  const clean = resolvedPath === "/" ? "/" : resolvedPath.replace(/\/+$/, "");
  if (clean === "/") {
    return { parentPath: "/", name: "" };
  }
  const idx = clean.lastIndexOf("/");
  if (idx <= 0) {
    return { parentPath: "/", name: clean.slice(1) };
  }
  return {
    parentPath: clean.slice(0, idx),
    name: clean.slice(idx + 1),
  };
}

export function findVfsNode(tree: VfsNode[], targetPath: string): VfsNode | null {
  const cleanTarget = targetPath === "/" ? "/" : targetPath.replace(/\/+$/, "");
  for (const node of tree) {
    if (node.path === cleanTarget) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findVfsNode(node.children, cleanTarget);
      if (found) return found;
    }
  }
  return null;
}

export function flattenVfsPaths(tree: VfsNode[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: VfsNode[]) => {
    for (const node of nodes) {
      paths.push(node.path);
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return paths;
}

export function renderAsciiTree(node: VfsNode): string[] {
  const lines: string[] = [];
  const headerTag = node.type === "DIRECTORY" ? "[DIR] " : "[FILE]";
  lines.push(`${headerTag} ${node.path}`);

  const walk = (children: VfsNode[], prefix: string) => {
    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1;
      const branch = isLast ? "└── " : "├── ";
      const tag = child.type === "DIRECTORY" ? "[DIR] " : "[FILE]";
      const meta =
        child.type === "DIRECTORY"
          ? `${child.permissions}`
          : `${child.size}B  ${child.permissions}`;
      lines.push(`${prefix}${branch}${tag} ${child.name}  (${meta})`);
      if (child.children && child.children.length > 0) {
        walk(child.children, `${prefix}${isLast ? "    " : "│   "}`);
      }
    });
  };

  if (node.children && node.children.length > 0) {
    walk(node.children, "");
  }
  return lines;
}

