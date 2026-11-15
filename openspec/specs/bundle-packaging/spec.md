# bundle-packaging Specification

## Purpose
Defines the packaged install artifact produced by `npm run bundle:pack`: one artifact pair per version at a time, replaced only by an explicit `--force` repack, with the metadata `revision` identifying which commit the bytes came from. Installing the artifact freezes the running plugin: source edits no longer change it or reload it, so a review keeps the installed logic until the user installs a newer artifact.

## Requirements

### Requirement: Packaging produces one tarball and its metadata

The packaging entrypoint SHALL publish the package manifest's published file set as `<name>-<version>.tgz` under the repository `dist/` directory and SHALL write `<name>-<version>.json` beside it. The metadata SHALL record the package name, the version, the file name, the tarball's sha512, its byte size, its file count, the `HEAD` revision, whether the tree was dirty and the packed-at timestamp.

#### Scenario: A clean tree is packed

- **WHEN** the entrypoint runs on a clean working tree whose version has no packed artifact yet
- **THEN** `dist/` holds the tarball and a metadata file naming the `HEAD` revision

#### Scenario: The packed file set follows the manifest

- **WHEN** the manifest's published file list changes
- **THEN** the next tarball carries that list and the metadata's file count reflects it

### Requirement: Packaging refuses a dirty working tree

The packaging entrypoint SHALL refuse to pack when the working tree has uncommitted changes, because the metadata's revision would not describe the packed code. It SHALL report the dirty paths and exit nonzero.

#### Scenario: A clean tree is accepted

- **WHEN** the working tree is clean and no artifact exists for the version
- **THEN** the entrypoint packs the tarball and writes the metadata

#### Scenario: Untracked or modified files block packing

- **WHEN** the working tree holds a modified or untracked file
- **THEN** the entrypoint packs nothing, names the dirty paths and exits nonzero

### Requirement: Packaging replaces an artifact pair only on request

The packaging entrypoint SHALL refuse to overwrite an existing tarball or metadata file for the same version unless the caller passes `--force`. With `--force` it SHALL replace both files and record the new `HEAD` revision, so a fixed artifact can be republished under the same version.

#### Scenario: The version is already packed

- **WHEN** `dist/` already holds the artifact pair for the manifest version and the caller passes no `--force`
- **THEN** the entrypoint leaves both files untouched and exits nonzero

#### Scenario: A later commit repacks the same version

- **WHEN** the caller passes `--force` after a new commit for a version already packed
- **THEN** the entrypoint replaces both files and the metadata's revision equals the new `HEAD`

### Requirement: Packaging verifies the packed content

After packing into a temporary destination, the entrypoint SHALL verify the tarball against an unconditional core set plus the manifest's `files` expansion, and SHALL fail when a required path is missing or the tarball carries a test, OpenSpec or script path. The core set SHALL be independent of `files`. A failed check SHALL leave `dist/` unchanged for both a rejected first pack and a rejected `--force` repack.

#### Scenario: A complete tarball passes

- **WHEN** the tarball carries `package.json`, the manifest's `main` and `exports` targets, `cordis.patch.yml`, `icon.svg`, every `lib/` file, every skill and the locale resources, and omits the tests and OpenSpec artifacts
- **THEN** the entrypoint moves it into `dist/` and writes the metadata

#### Scenario: The core set does not depend on the file list

- **WHEN** the manifest's `files` list drops `index.js` and the tarball omits it
- **THEN** the entrypoint fails and names `index.js`, because the core set requires it regardless of `files`

#### Scenario: A missing runtime file fails

- **WHEN** the tarball omits `index.js`, a `lib/` file, a shipped skill or a locale file, whether or not the `files` list names it
- **THEN** the entrypoint fails, names the missing path, and leaves `dist/` without the rejected tarball or a new metadata file

#### Scenario: A forced repack fails the content check

- **WHEN** a `--force` repack produces a tarball that fails the content check
- **THEN** `dist/` still holds the previous artifact pair unchanged and the entrypoint exits nonzero

### Requirement: Installation stays manual and outside the script

The packaging entrypoint SHALL NOT call the plugin manager, write the profile manifest, write a profile patch or run a package manager in the profile directory. It SHALL name the install target it produced so the user can install that file in the Plugins page. Replacing an installed bundle SHALL be described as removing the bundle first and then installing the artifact, because the manager refuses a spec the profile already depends on.

#### Scenario: The entrypoint finishes

- **WHEN** packaging succeeds
- **THEN** its output names the tarball path and states that installing it is a user action in the Plugins page

#### Scenario: An installed version is replaced

- **WHEN** the user wants the repacked artifact of an already installed version to run
- **THEN** the documented procedure removes the bundle in the Plugins page before installing the artifact

### Requirement: The installed bundle is frozen against source edits

An installed tarball SHALL run from the profile's own copy. Editing the plugin's sources in the working tree SHALL NOT change that copy and SHALL NOT reload the running plugin. A review SHALL keep the installed version's logic and complete on it, without a repack or reinstall per commit. New plugin logic SHALL take effect only after the user installs a newly packed tarball.

#### Scenario: Sources change during a review

- **WHEN** a contributor edits plugin sources while a review is running
- **THEN** the installed copy and the running reviewer keep the installed version and the review continues

#### Scenario: New plugin logic is installed

- **WHEN** the user installs a newly packed tarball in the Plugins page
- **THEN** the running plugin uses that artifact after the install takes effect

#### Scenario: No repack per apply round

- **WHEN** an apply round adds a commit without changing the plugin logic the reviewer depends on
- **THEN** no repack or reinstall is required for the review to proceed
