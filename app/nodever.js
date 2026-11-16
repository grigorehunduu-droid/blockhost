// Exit code 0 when this Node is new enough (18+). Used by the launcher.
process.exit(+process.versions.node.split('.')[0] >= 18 ? 0 : 1);
