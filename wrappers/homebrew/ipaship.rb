class Ipaship < Formula
  desc "ipaShip CLI client for auditing iOS applications"
  homepage "https://ipaship.com"
  url "https://github.com/atharvnaik1/GraciasAi-Appstore-Policy-Auditor-Opensource/archive/v1.0.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "Polyform Noncommercial License 1.0.0"

  def install
    bin.install "wrappers/linux/ipaship-cli.sh" => "ipaship"
  end

  test do
    system "#{bin}/ipaship", "--version"
  end
end