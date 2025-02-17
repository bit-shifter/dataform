package(default_visibility = ["//visibility:public"])

load("//testing:index.bzl", "ts_test_suite")

ts_test_suite(
    name = "tests",
    srcs = glob(
        ["*.ts"],
        exclude = [
            # SQL Data warehouse integration tests are currently disabled while we sort out a new testing server.
            "sqldatawarehouse.spec.ts",
            # Redshift integrations tests are currently disabled while we reorganize cluster structure.
            "redshift.spec.ts",
            # Presto tests are disabled until our adapter is updated to Trinio.
            "presto.spec.ts",
            # Postgres image build is failing.
            "postgres.spec.ts",
        ],
    ),
    data = [
        "//test_credentials:bigquery.json",
        "//test_credentials:snowflake.json",
        "//test_credentials:sqldatawarehouse.json",
        "//tests/integration/bigquery_project:files",
        "//tests/integration/bigquery_project:node_modules",
        "//tests/integration/snowflake_project:files",
        "//tests/integration/snowflake_project:node_modules",
        "//tests/integration/sqldatawarehouse_project:files",
        "//tests/integration/sqldatawarehouse_project:node_modules",
    ],
    templated_args = ["--snowflake-use-ocsp=false"],
    deps = [
        "//api",
        "//api/utils",
        "//common/promises",
        "//core",
        "//protos:ts",
        "//testing",
        "//tests/utils",
        "@npm//@types/chai",
        "@npm//@types/long",
        "@npm//@types/node",
        "@npm//chai",
    ],
)
