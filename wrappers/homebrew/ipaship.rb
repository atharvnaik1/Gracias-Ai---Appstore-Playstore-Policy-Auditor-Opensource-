class Ipaship < Formula
  desc "ipaShip CLI client for auditing iOS applications"
  homepage "https://ipaship.com"
  url "https://github.com/async-atharv/ipaShip/archive/v1.0.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"

  def install
    bin.install "wrappers/linux/ipaship-cli.sh" => "ipaship"
  end

  test do
    system "#{bin}/ipaship", "--version"
  end
end