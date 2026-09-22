# Local project plan engine

MPXJ 16.7.0 is copyright its respective contributors and licensed under GNU
Lesser General Public License 2.1 or later. See `legal/MPXJ-LICENSE.txt`.
The library is unmodified. Its corresponding source is included in
`runtime/sources/mpxj-16.7.0-sources.jar` and is available from
https://repo.maven.apache.org/maven2/net/sf/mpxj/mpxj/16.7.0/ .

Runtime dependency source archives are in `runtime/sources`. Upstream license,
notice and Maven metadata files are extracted without changes into
`runtime/legal`, and remain inside the original jars in `runtime/lib`.
The exact binary inventory and SHA-256 hashes are in `runtime/build-receipt.json`.

The Java 17 runtime is assembled with jlink from Eclipse Temurin. Its GPLv2
with Classpath Exception license, third-party notices and additional module
licenses are preserved under `runtime/jre/legal`. The exact JDK build is
recorded in the receipt and `runtime/jre/release`. Corresponding Temurin source:
https://github.com/adoptium/temurin17-binaries/releases .

The Agent Pi Java bridge source is `src/ProjectPlan.java`, under this product's
GPL-3.0-only license. Rebuild using Java 17, Maven and
`node scripts/build-project-plan.mjs` from the product root. The Maven dependency
versions are in `pom.xml`. Users may replace MPXJ with a compatible modified jar
in `runtime/lib`, or rebuild the bridge; runtime loading imposes no signature or
hash restriction. Release-time inventory verification is only a packaging check.
Reverse engineering for debugging modifications to the LGPL components is allowed.

All project parsing and conversion occurs locally in a separate JVM process.
MPP is read-only; edited plans are exported as Project XML. P6 XER and PMXML can
be read and written. Conversion does not promise preservation of every vendor
field or perform automatic scheduling. Always retain the original plan.
