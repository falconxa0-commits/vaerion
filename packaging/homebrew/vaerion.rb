# Vaerion Homebrew formula — macOS / Linuxbrew delivery channel.
#
# REGENERATED AT RELEASE TIME: the url/sha256 pair is filled from the
# signed release set (SHA256SUMS) produced by tools/dist-pack.ts. The
# values below are placeholders until the release train publishes the
# tarball (Founder-gated, risk-ledger F-1/F-5).
#
# VERIFICATION STATUS: authored on Linux; syntax-reviewed but NOT executed
# in this environment (no brew). Platform marker: UNVERIFIED — BREW.
class Vaerion < Formula
  desc "AI-native development engine — deterministic, auditable, local-first"
  homepage "https://vaerion.dev"
  url "https://vaerion.dev/dist/vaerion-0.1.12-rc1-source.tar.gz" # release-time: filled from SHA256SUMS
  sha256 "0000000000000000000000000000000000000000000000000000000000000000" # release-time
  license "Apache-2.0"

  depends_on "bun"

  def install
    # The engine is self-contained TypeScript under packages/vaerion/src.
    libexec.install "packages/vaerion/src" => "engine"
    (libexec/"engine/package.json").write <<~JSON
      { "name": "vaerion-engine", "private": true,
        "dependencies": { "ajv": "^8.17.1", "hash-wasm": "^4.12.0", "yaml": "^2.8.0" } }
    JSON
    system "bun", "install", "--production", "--cwd", libexec/"engine"

    (bin/"vae").write <<~EOS
      #!/bin/sh
      exec bun run "#{libexec}/engine/cli/vae.ts" "$@"
    EOS
  end

  def caveats
    <<~EOS
      Vaerion executes on the Bun runtime (installed as a dependency).
      Verify: vae --version && vae doctor
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vae version")
  end
end
