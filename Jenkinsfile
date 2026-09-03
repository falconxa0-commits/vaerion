// Vaerion CI — declarative Jenkins port of .github/workflows/verify.yml.
//
// D-R law: this pipeline is a REMOTE PROJECTION of the single verification
// authority — tools/verify.ts. No CI surface may re-implement the gates;
// it only installs (frozen lockfile, supply-chain law) and runs the
// authority, then archives the measured verification record.
//
// Agent requirement: Bun 1.3.14 on the agent (the pinned verified
// substrate; mirror the version used by the GitHub workflow).

pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Install') {
            steps {
                sh 'bun install --frozen-lockfile'
            }
        }
        stage('Verify') {
            steps {
                sh 'bun run tools/verify.ts'
            }
        }
    }

    post {
        always {
            archiveArtifacts(
                artifacts: '.vaerion-verification.json, .vaerion-logs/**',
                allowEmptyArchive: false,
                fingerprint: true
            )
        }
    }
}
