'use strict';

/**
 * Custom NX version actions for Typst packages.
 *
 * Reads and writes the `version` field inside `[package]` in typst.toml.
 * NX's built-in version actions target package.json; this replaces that
 * for projects where typst.toml is the source of truth for the version.
 */

const { VersionActions } = require('nx/src/command-line/release/version/version-actions');

class TypstVersionActions extends VersionActions {
  constructor(...args) {
    super(...args);
    /** The manifest filename NX will search for in the project root. */
    this.validManifestFilenames = ['typst.toml'];
  }

  /**
   * Read the current version from typst.toml on disk.
   * Called when currentVersionResolver is "disk".
   */
  async readCurrentVersionFromSourceManifest(tree) {
    if (!this.manifestsToUpdate.length) return null;
    const { manifestPath } = this.manifestsToUpdate[0];
    const content = tree.read(manifestPath, 'utf-8');
    if (!content) return null;
    const match = content.match(/^version\s*=\s*"([^"]+)"/m);
    if (!match) return null;
    return { currentVersion: match[1], manifestPath };
  }

  /** Not applicable — Typst Universe has no queryable registry API. */
  async readCurrentVersionFromRegistry(_tree, _metadata) {
    return null;
  }

  /** Typst packages have no intra-monorepo dependencies to track. */
  async readCurrentVersionOfDependency(_tree, _projectGraph, _depName) {
    return { currentVersion: null, dependencyCollection: null };
  }

  /**
   * Write the new version back into typst.toml.
   * Returns the list of files modified (for NX to stage and commit).
   */
  async updateProjectVersion(tree, newVersion) {
    if (!this.manifestsToUpdate.length) return [];
    const { manifestPath } = this.manifestsToUpdate[0];
    const content = tree.read(manifestPath, 'utf-8');
    if (!content) return [];
    const updated = content.replace(
      /^(version\s*=\s*)"[^"]+"/m,
      `$1"${newVersion}"`
    );
    tree.write(manifestPath, updated);
    return [manifestPath];
  }
}

module.exports = TypstVersionActions;
