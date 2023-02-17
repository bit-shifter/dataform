import { prune } from "df/api/commands/prune";
import { state } from "df/api/commands/state";
import * as dbadapters from "df/api/dbadapters";
import { StringifiedMap, StringifiedSet } from "df/common/strings/stringifier";
import { adapters } from "df/core";
import { targetStringifier } from "df/core/targets";
import * as utils from "df/core/utils";
import * as core from "df/protos/core";
import * as execution from "df/protos/execution";

export async function build(
  compiledGraph: dataform.CompiledGraph,
  runConfig: execution.RunConfig,
  dbadapter: dbadapters.IDbAdapter
) {
  runConfig = {
    ...runConfig,
    useRunCache: false
  };

  const prunedGraph = prune(compiledGraph, runConfig);

  const allInvolvedTargets = new StringifiedSet<core.Target>(
    targetStringifier,
    prunedGraph.tables.map(table => table.target)
  );
  if (runConfig.useRunCache) {
    for (const includedAction of [
      ...prunedGraph.tables,
      ...prunedGraph.operations,
      ...prunedGraph.assertions
    ]) {
      allInvolvedTargets.add(includedAction.target);
    }
  }

  return new Builder(
    prunedGraph,
    runConfig,
    await state(dbadapter, Array.from(allInvolvedTargets))
  ).build();
}

export class Builder {
  private readonly adapter: adapters.IAdapter;

  constructor(
    private readonly prunedGraph: dataform.CompiledGraph,
    private readonly runConfig: execution.RunConfig,
    private readonly warehouseState: dataform.WarehouseState
  ) {
    this.adapter = adapters.create(
      prunedGraph.projectConfig,
      prunedGraph.dataformCoreVersion || "1.0.0"
    );
    prunedGraph.tables.forEach(utils.setOrValidateTableEnumType);
  }

  public build(): dataform.ExecutionGraph {
    if (utils.graphHasErrors(this.prunedGraph)) {
      throw new Error(`Project has unresolved compilation or validation errors.`);
    }

    const tableMetadataByTarget = new StringifiedMap<core.Target, execution.TableMetadata>(
      targetStringifier
    );
    this.warehouseState.tables.forEach(tableState => {
      tableMetadataByTarget.set(tableState.target, tableState);
    });

    const actions: dataform.ExecutionAction[] = [].concat(
      this.prunedGraph.tables.map(t =>
        this.buildTable(t, tableMetadataByTarget.get(t.target), this.runConfig)
      ),
      this.prunedGraph.operations.map(o => this.buildOperation(o)),
      this.prunedGraph.assertions.map(a => this.buildAssertion(a))
    );
    return dataform.ExecutionGraph.create({
      projectConfig: this.prunedGraph.projectConfig,
      runConfig: this.runConfig,
      warehouseState: this.warehouseState,
      declarationTargets: this.prunedGraph.declarations.map(declaration => declaration.target),
      actions
    });
  }

  private buildTable(
    table: core.Target,
    tableMetadata: execution.TableMetadata,
    runConfig: execution.RunConfig
  ) {
    if (table.protected && this.runConfig.fullRefresh) {
      throw new Error("Protected datasets cannot be fully refreshed.");
    }

    return {
      ...this.toPartialExecutionAction(table),
      type: "table",
      tableType: utils.tableTypeEnumToString(table.enumType),
      tasks: table.disabled
        ? []
        : this.adapter.publishTasks(table, runConfig, tableMetadata).build(),
      hermeticity: table.hermeticity || core.ActionHermeticity.HERMETIC
    };
  }

  private buildOperation(operation: core.Operation) {
    return {
      ...this.toPartialExecutionAction(operation),
      type: "operation",
      tasks: operation.disabled
        ? []
        : operation.queries.map(statement => ({ type: "statement", statement })),
      hermeticity: operation.hermeticity || core.ActionHermeticity.NON_HERMETIC
    };
  }

  private buildAssertion(assertion: core.Assertion) {
    return {
      ...this.toPartialExecutionAction(assertion),
      type: "assertion",
      tasks: assertion.disabled
        ? []
        : this.adapter.assertTasks(assertion, this.prunedGraph.projectConfig).build(),
      hermeticity: assertion.hermeticity || core.ActionHermeticity.HERMETIC
    };
  }

  private toPartialExecutionAction(action: core.Target | core.Operation | core.Assertion) {
    return dataform.ExecutionAction.create({
      target: action.target,
      fileName: action.fileName,
      dependencyTargets: action.dependencyTargets,
      actionDescriptor: action.actionDescriptor
    });
  }
}
